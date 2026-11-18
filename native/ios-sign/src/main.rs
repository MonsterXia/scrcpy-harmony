#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unknown_ops_and_unscoped_storage() {
        assert!(validate(&serde_json::json!({"op":"exec","scope":"a".repeat(64)})).is_err());
        assert!(validate(&serde_json::json!({"op":"account","scope":"iloader"})).is_err());
        assert!(validate(&serde_json::json!({"op":"account","scope":"a".repeat(64)})).is_ok());
    }
    #[test]
    fn rejects_ambiguous_target_and_team() {
        assert!(validate(&serde_json::json!({"op":"install","scope":"a".repeat(64),"udid":"all","teamId":"TEAM123456"})).is_err());
    }
    #[test]
    fn logout_removes_authorization_but_preserves_signing_identity_for_relogin() {
        use isideload::util::storage::InMemoryStorage;
        let store=Store{inner:InMemoryStorage::new()};
        let identity_key=format!("{}/key", "a".repeat(64));
        let private_key=b"\x00\x80\xff signing identity fixture";
        store.store("session", "old authorization").unwrap();
        store.store_data(&identity_key, private_key).unwrap();
        store.store_data("anisette_state", b"device provisioning state").unwrap();

        store.logout().unwrap();
        assert_eq!(store.retrieve("session").unwrap(), None);
        assert_eq!(store.retrieve_data(&identity_key).unwrap().as_deref(), Some(private_key.as_slice()));
        assert_eq!(store.retrieve_data("anisette_state").unwrap().as_deref(), Some(b"device provisioning state".as_slice()));

        store.logout().unwrap();
        store.store("session", "new authorization").unwrap();
        assert_eq!(store.retrieve("session").unwrap().as_deref(), Some("new authorization"));
        assert_eq!(store.retrieve_data(&identity_key).unwrap().as_deref(), Some(private_key.as_slice()));
    }
    #[test]
    fn logout_does_not_require_the_legacy_key_index() {
        use isideload::util::storage::InMemoryStorage;
        let store=Store{inner:InMemoryStorage::new()};
        store.store("session", "authorization").unwrap();
        store.inner.store("keys", "invalid legacy index").unwrap();
        store.logout().unwrap();
        assert_eq!(store.retrieve("session").unwrap(), None);
    }
}

use std::{io::{self, BufRead, Write}, sync::OnceLock, time::{SystemTime, UNIX_EPOCH}};
use serde_json::{json,Value};
use rootcause::prelude::*;
use isideload::{
    anisette::{AnisetteClientInfo,remote_v3::RemoteV3AnisetteProvider},
    auth::apple_account::{AppleAccount,AppToken,TwoFactorCallbackResponse},
    dev::{developer_session::{DeveloperSession,TeamsApi,DevicesApi},teams::DeveloperTeam},
    sideload::{SideloaderBuilder,TeamSelection,builder::{MaxCertsBehavior,ExtensionsBehavior,ExtensionsBehaviorSelection}},
    util::{device::IdeviceInfo,callbacks::{MaxCertsCallbackBox,ExtensionsBehaviorCallbackBox},storage::SideloadingStorage,keyring_storage::KeyringStorage},
};
use idevice::usbmuxd::{UsbmuxdConnection,UsbmuxdAddr,Connection};
use zeroize::Zeroize;
const PREFIX:&str="io.scrcpyplus.unsigned.WebDriverAgentRunner.xctrunner";
static TEAM:OnceLock<String>=OnceLock::new();
fn text<'a>(v:&'a Value,k:&str)->Result<&'a str,Report>{v.get(k).and_then(Value::as_str).ok_or_else(||report!("protocol"))}
fn validate(v:&Value)->Result<(),Report>{
    let op=text(v,"op")?; let scope=text(v,"scope")?;
    if !["account","login","logout","install"].contains(&op) || scope.len()!=64 || !scope.bytes().all(|b|b.is_ascii_hexdigit()) {bail!("protocol")}
    if op=="install" {
        let udid=text(v,"udid")?; let team=text(v,"teamId")?;
        if !(8..=64).contains(&udid.len()) || !udid.bytes().all(|b|b.is_ascii_hexdigit()||b==b'-') || team.len()!=10 || !team.bytes().all(|b|b.is_ascii_uppercase()||b.is_ascii_digit()){bail!("protocol")}
        let _=text(v,"ipa")?;
    }
    Ok(())
}
fn read()->Result<Value,Report>{
    let mut bytes=Vec::new();
    use std::io::Read;
    io::stdin().lock().take(65537).read_until(b'\n',&mut bytes)?;
    if bytes.len()>65536 || bytes.last()!=Some(&b'\n'){bail!("protocol")}
    let value=serde_json::from_slice(&bytes); bytes.zeroize(); Ok(value?)
}
fn emit(value:Value){println!("{}",value);let _=io::stdout().flush();}
struct Store<S=KeyringStorage> {inner:S}
impl Store<KeyringStorage> {
    fn new(scope:&str)->Self{Self{inner:KeyringStorage::new(format!("io.scrcpyplus.signing.{scope}"))}}
}
impl<S:SideloadingStorage> Store<S> {
    fn logout(&self)->Result<(),Report>{
        // The server certificate survives logout. Keep its only private key so
        // signing can reuse it after login without consuming another cert slot.
        // Anisette state identifies this client; it does not authorize an account.
        self.inner.delete("session")
    }
}
impl<S:SideloadingStorage> SideloadingStorage for Store<S> {
    fn store(&self,key:&str,value:&str)->Result<(),Report>{
        self.inner.store(key,value)
    }
    fn store_data(&self,key:&str,value:&[u8])->Result<(),Report>{
        self.inner.store_data(key,value)
    }
    fn retrieve_data(&self,key:&str)->Result<Option<Vec<u8>>,Report>{self.inner.retrieve_data(key)}
    fn retrieve(&self,key:&str)->Result<Option<String>,Report>{self.inner.retrieve(key)}
    fn delete(&self,key:&str)->Result<(),Report>{self.inner.delete(key)}
}
async fn account(email:&str,scope:&str)->Result<AppleAccount,Report>{
    AppleAccount::builder(email).err_429_retries(Some(1)).anisette_provider(
        RemoteV3AnisetteProvider::new("https://ani.iloader.app",Box::new(Store::new(scope)),"0".into())?
        .set_client_info_override(Some(AnisetteClientInfo{
            client_info:"<Mac15,7> <macOS;27.0;26A5378j> <com.apple.AuthKit/1 (com.apple.akd/1.0)>".into(),
            user_agent:"akd/1.0 CFNetwork/811.5.4".into()}))
    ).build().await
}
async fn operate(mut v:Value)->Result<Value,Report>{
    validate(&v)?;
    let scope=text(&v,"scope")?.to_owned();let store=Store::new(&scope);
    let op=text(&v,"op")?.to_owned();
    if op=="logout" {store.logout()?;return Ok(json!({"authenticated":false}));}
    if op=="account" {
        let stored=store.retrieve("session")?;
        return match stored {None=>Ok(json!({"authenticated":false})),Some(s)=>{
            let s:Value=serde_json::from_str(&s)?;
            let valid=s["expiry"].as_u64().unwrap_or(0)>SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
            Ok(json!({"authenticated":valid,"teams":s["teams"]}))
        }};
    }
    if op=="login" {
        let email=text(&v,"email")?.trim().to_lowercase();
        if email.len()>254 || !email.contains('@'){bail!("protocol")}
        let mut password=v["password"].take().as_str().ok_or_else(||report!("protocol"))?.to_owned();
        let mut acc=account(&email,&scope).await?;
        let result=acc.login(&password,async |params| {
            emit(json!({"event":"challenge","challenge":params}));
            let response=read()?;
            let action=text(&response,"action")?;
            Ok(match action {
                "code"=>{let code=text(&response,"code")?;if code.len()!=6||!code.bytes().all(|b|b.is_ascii_digit()){bail!("protocol")};TwoFactorCallbackResponse::SubmitCode(code.into())},
                "devices"=>TwoFactorCallbackResponse::SendToDevices,
                "sms"=>TwoFactorCallbackResponse::SendSms(response["numberId"].as_u64().filter(|n|*n<=u32::MAX as u64).ok_or_else(||report!("protocol"))? as u32),
                "resend"=>TwoFactorCallbackResponse::ResendCode,
                _=>TwoFactorCallbackResponse::Abort
            })
        }).await;
        password.zeroize();result?;
        let token=acc.get_app_token("xcode.auth").await?;
        let adsid=acc.spd.as_ref().and_then(|s|s.get("adsid")).and_then(|s|s.as_string()).ok_or_else(||report!("auth-required"))?.to_owned();
        let mut dev=DeveloperSession::new(token.clone(),adsid.clone(),acc.grandslam_client.clone(),acc.anisette_generator.clone());
        let teams=dev.list_teams().await?;
        if teams.is_empty(){bail!("no-team")}
        let teams:Vec<Value>=teams.iter().map(|t|json!({"id":t.team_id,"name":t.name,"kind":t.r#type})).collect();
        store.store("session",&json!({"email":email,"token":token.token,"duration":token.duration,"expiry":token.expiry,"adsid":adsid,"teams":teams}).to_string())?;
        return Ok(json!({"authenticated":true,"teams":teams}));
    }
    let session=store.retrieve("session")?.ok_or_else(||report!("auth-required"))?;
    let session:Value=serde_json::from_str(&session)?;
    if session["expiry"].as_u64().unwrap_or(0)<=SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs(){bail!("auth-required")}
    let email=text(&session,"email")?;
    let acc=account(email,&scope).await?;
    let token=AppToken{token:text(&session,"token")?.into(),duration:session["duration"].as_u64().unwrap_or(0),expiry:session["expiry"].as_u64().unwrap_or(0)};
    let mut dev=DeveloperSession::new(token,text(&session,"adsid")?.into(),acc.grandslam_client,acc.anisette_generator);
    let team=text(&v,"teamId")?;
    if !dev.list_teams().await?.iter().any(|t|t.team_id==team){bail!("team-unavailable")}
    let _=TEAM.set(team.into());
    let mut mux=UsbmuxdConnection::default().await?;
    let device=mux.get_devices().await?.into_iter().find(|d| d.udid==text(&v,"udid").unwrap_or("") && matches!(d.connection_type,Connection::Usb)).ok_or_else(||report!("device-unavailable"))?;
    let provider=device.to_provider(UsbmuxdAddr::from_env_var()?,"Scrcpy Plus");
    let mut signer=SideloaderBuilder::<MaxCertsCallbackBox,ExtensionsBehaviorCallbackBox>::new(dev,email.into())
        .team_selection(TeamSelection::PromptAlways(|teams:&Vec<DeveloperTeam>|TEAM.get().filter(|id|teams.iter().any(|t|&t.team_id==*id)).cloned()))
        .max_certs_behavior(MaxCertsBehavior::Error)
        .extensions_behavior(ExtensionsBehaviorSelection::Fixed(ExtensionsBehavior::ReuseMain))
        .machine_name("Scrcpy Plus".into()).storage(Box::new(store)).build();
    if signer.get_team().await?.team_id!=team{bail!("team-unavailable")}
    emit(json!({"event":"phase","phase":"installing"}));
    let device_info=IdeviceInfo::from_device(&provider).await?;
    if device_info.udid!=text(&v,"udid")? {bail!("device-unavailable")}
    let selected=signer.get_team().await?;
    signer.get_dev_session().ensure_device_registered(&selected,&device_info.name,&device_info.udid,None).await?;
    let (signed,_)=signer.sign_app(text(&v,"ipa")?.into(),Some(selected),false,None::<fn(f32)->std::future::Ready<()>>,None,Some(&device_info.udid)).await?;
    emit(json!({"event":"install-ready"}));
    let result=async {
        if text(&read()?,"action")? != "install" {bail!("cancelled")}
        isideload::sideload::install::install_app(&provider,&signed,|_|{}).await?;
        Ok::<(),Report>(())
    }.await;
    let _=std::fs::remove_dir_all(&signed);
    result?;
    Ok(json!({"bundleId":format!("{PREFIX}.{team}")}))
}
fn code(e:&Report)->&'static str {
    let s=format!("{e:?}").to_lowercase();
    for code in ["protocol","auth-required","team-unavailable","no-team","device-unavailable"]{if s.contains(code){return code}}
    if s.contains("maximum")&&s.contains("certificate"){return "certificate-limit"}
    if s.contains("keyring")||s.contains("keychain"){return "keychain-unavailable"}
    if s.contains("session")||s.contains("token")||s.contains("authentication"){return "auth-required"}
    "signing-failed"
}
#[tokio::main]
async fn main(){
    let _=rustls::crypto::ring::default_provider().install_default();
    // No tracing subscriber: upstream auth/provisioning messages never reach logs.
    match async {operate(read()?).await}.await {
        Ok(result)=>emit(json!({"result":result})),
        Err(error)=>{emit(json!({"error":code(&error)}));std::process::exit(1)}
    }
}
