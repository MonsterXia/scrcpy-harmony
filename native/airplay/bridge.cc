#include <napi.h>
#include <atomic>
#include <cstring>
#include <cstdio>
#include <vector>
#include <string>
extern "C" {
#include "raop.h"
}

// The protocol engine runs its own socket threads. Only copied, bounded packets
// cross into V8; upstream never sees JS objects or Electron WebContents.
struct Packet {
    std::vector<unsigned char> bytes;
    std::string type;
    uint64_t timestamp = 0;
    bool reset = false;
};
class Receiver : public Napi::ObjectWrap<Receiver> {
    raop_t *raop_ = nullptr;
    dnssd_t *dns_ = nullptr;
    Napi::ThreadSafeFunction callback_;
    bool callback_live_ = false;
    std::atomic<bool> stopping_{true};
    std::atomic<bool> gap_{false};
    static Receiver *active_;
    void Emit(Packet *packet) {
        if (stopping_) { delete packet; return; }
        packet->reset = gap_.exchange(false);
        auto result = callback_.NonBlockingCall(packet, [](Napi::Env env, Napi::Function fn, Packet *p) {
            if (env && fn) {
                auto event = Napi::Object::New(env);
                event.Set("type", p->type);
                event.Set("timestamp", Napi::Number::New(env, static_cast<double>(p->timestamp)));
                event.Set("reset", p->reset);
                if (!p->bytes.empty()) event.Set("data", Napi::Buffer<unsigned char>::Copy(env, p->bytes.data(), p->bytes.size()));
                fn.Call({event});
            }
            delete p;
        });
        if (result != napi_ok) { gap_ = true; delete packet; }
    }
    static void Video(void *ctx, raop_ntp_t *, video_decode_struct *data) {
        auto self = static_cast<Receiver *>(ctx);
        if (data->is_h265 || data->data_len <= 0 || data->data_len > 8 * 1024 * 1024) { self->gap_ = true; return; }
        auto packet = new Packet(); packet->type = "video";
        packet->timestamp = data->ntp_time_local / 1000; // upstream NTP times are nanoseconds
        packet->bytes.assign(data->data, data->data + data->data_len);
        self->Emit(packet);
    }
    static void Reset(void *ctx, reset_type_t) {
        auto self = static_cast<Receiver *>(ctx); self->gap_ = true;
        auto packet = new Packet(); packet->type = "reset"; self->Emit(packet);
    }
    static int Codec(void *, video_codec_t codec, unsigned short, unsigned short, unsigned short, unsigned short, unsigned short, unsigned short) {
        return codec == VIDEO_CODEC_H264 ? 0 : -1;
    }
    static void Running(void *ctx, bool running) {
        auto packet = new Packet(); packet->type = running ? "connected" : "disconnected";
        static_cast<Receiver *>(ctx)->Emit(packet);
    }
    void StopCore() {
        stopping_ = true;
        if (dns_) { dnssd_unregister_raop(dns_); dnssd_unregister_airplay(dns_); }
        if (raop_) { raop_destroy(raop_); raop_ = nullptr; }
        if (dns_) { dnssd_destroy(dns_); dns_ = nullptr; }
        if (callback_live_) { callback_.Release(); callback_live_ = false; }
        if (active_ == this) active_ = nullptr;
    }
public:
    Receiver(const Napi::CallbackInfo &info) : Napi::ObjectWrap<Receiver>(info) {}
    ~Receiver() { StopCore(); }
    Napi::Value Start(const Napi::CallbackInfo &info) {
        auto env = info.Env();
        if (info.Length() != 4 || !info[0].IsString() || !info[1].IsString() || !info[2].IsString() || !info[3].IsFunction())
            throw Napi::TypeError::New(env, "Expected name, device id, key file and callback");
        if (active_) throw Napi::Error::New(env, "An AirPlay receiver is already active");
        std::string name = info[0].As<Napi::String>(), id = info[1].As<Napi::String>(), key = info[2].As<Napi::String>();
        if (name.empty() || name.size() > 63 || id.size() != 17 || key.empty()) throw Napi::TypeError::New(env, "Invalid receiver identity");
        active_ = this;
        callback_ = Napi::ThreadSafeFunction::New(env, info[3].As<Napi::Function>(), "AirPlay frames", 8, 1);
        callback_live_ = true; stopping_ = false;
        raop_callbacks_t cb{}; cb.cls = this;
        cb.video_process = Video;
        cb.audio_process = [](void *, raop_ntp_t *, audio_decode_struct *) {};
        cb.video_pause = cb.video_resume = cb.conn_feedback = cb.video_flush = cb.audio_flush = [](void *) {};
        cb.conn_init = cb.conn_destroy = cb.audio_stop_coverart_rendering = [](void *) {};
        cb.audio_set_metadata = cb.audio_set_coverart = [](void *, const void *, int) {};
        cb.audio_remote_control_id = cb.export_dacp = [](void *, const char *, const char *) {};
        cb.audio_set_progress = [](void *, uint32_t *, uint32_t *, uint32_t *) {};
        cb.display_pin = [](void *, char *) {};
        cb.register_client = [](void *, const char *, const char *, const char *) {};
        cb.video_reset = Reset; cb.video_set_codec_and_size = Codec; cb.mirror_video_running = Running;
        cb.conn_reset = [](void *ctx, int) { Reset(ctx, RESET_TYPE_RTP_SHUTDOWN); };
        cb.audio_set_client_volume = [](void *) -> double { return -144.0; };
        cb.audio_set_volume = [](void *, float) {};
        cb.audio_get_format = [](void *, unsigned char *, unsigned short *, bool *, bool *, uint64_t *) {};
        cb.report_client_request = [](void *, char *, char *, char *, bool *admit) { *admit = true; };
        cb.check_register = [](void *, const char *) -> bool { return false; };
        cb.passwd = [](void *, int *length) -> const char * { *length = 0; return nullptr; };
        // HLS/video URLs are deliberately not played by this screen-only frontend.
        cb.on_video_play = [](void *, const char *, float) {};
        cb.on_video_scrub = cb.on_video_rate = [](void *, float) {};
        cb.on_video_stop = [](void *) {};
        cb.on_video_acquire_playback_info = [](void *, playback_info_t *p) { std::memset(p, 0, sizeof(*p)); };
        cb.on_video_playlist_remove = [](void *) -> float { return 0; };
        cb.get_custom_profile = [](void *, const char **p) { *p = nullptr; };
        ntp_global_init();
        raop_ = raop_init(&cb);
        if (!raop_ || raop_init2(raop_, 0, id.c_str(), key.c_str()) != 0) {
            StopCore(); throw Napi::Error::New(env, "AirPlay initialization failed");
        }
        // Keep protocol-stage diagnostics without logging headers, pairing keys
        // or media payloads from the engine's verbose debug output.
        raop_set_log_level(raop_, 7);
        raop_set_log_callback(raop_, [](void *, int level, const char *message) {
            if (!message) return;
            if (!std::strncmp(message, "Handling request ", 17)) {
                char method[24] = {}, url[128] = {};
                if (std::sscanf(message, "Handling request %23s with URL %127s", method, url) == 2) {
                    const char *path = url[0] == '/' ? url : "[stream]";
                    if (auto query = std::strchr(url, '?')) *query = '\0';
                    if (std::strcmp(path, "/feedback")) std::fprintf(stderr, "AirPlay request: %s %s\n", method, path);
                }
            } else if (level <= 4) {
                std::string line(message); line = line.substr(0, line.find('\n'));
                std::fprintf(stderr, "AirPlay protocol: %.256s\n", line.c_str());
            }
        }, nullptr);
        unsigned char mac[6]; unsigned int components[6];
        if (sscanf(id.c_str(), "%02x:%02x:%02x:%02x:%02x:%02x", &components[0], &components[1], &components[2], &components[3], &components[4], &components[5]) != 6) {
            StopCore(); throw Napi::TypeError::New(env, "Invalid receiver MAC");
        }
        for (int i = 0; i < 6; i++) mac[i] = static_cast<unsigned char>(components[i]);
        int error = 0;
        dns_ = dnssd_init(name.c_str(), static_cast<int>(name.size()), reinterpret_cast<const char *>(mac), 6, 0, &error);
        if (!dns_) { StopCore(); throw Napi::Error::New(env, "AirPlay discovery initialization failed"); }
        raop_set_dnssd(raop_, dns_);
        unsigned short port = 0;
        if (raop_start_httpd(raop_, &port) < 0 || !port) { StopCore(); throw Napi::Error::New(env, "AirPlay listener failed"); }
        raop_set_port(raop_, port);
        if (dnssd_register_raop(dns_, port) != 0 || dnssd_register_airplay(dns_, port) != 0) {
            StopCore(); throw Napi::Error::New(env, "AirPlay announcement failed");
        }
        return Napi::Number::New(env, port);
    }
    void Stop(const Napi::CallbackInfo &) { StopCore(); }
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        exports.Set("Receiver", DefineClass(env, "Receiver", { InstanceMethod("start", &Receiver::Start), InstanceMethod("stop", &Receiver::Stop) }));
        return exports;
    }
};
Receiver *Receiver::active_ = nullptr;
Napi::Object Init(Napi::Env env, Napi::Object exports) { return Receiver::Init(env, exports); }
NODE_API_MODULE(plus_airplay, Init)
