export type IosSetupPhase = 'idle' | 'checking' | 'login' | 'authenticating' | 'challenge' | 'verifying' | 'sending' | 'team' | 'signing' | 'installing' | 'mounting' | 'starting' | 'ready' | 'deferred' | 'error' | 'cancelled'
export interface IosSigningTeam { id: string; name?: string; kind?: string }
export interface IosSetupState {
  phase: IosSetupPhase
  authenticated?: boolean
  teams?: IosSigningTeam[]
  expiresAt?: number
  error?: string
  challenge?: { sms: boolean; unknown: boolean; retry?: boolean; numbers: Array<{ id: number; lastTwoDigits: string }>; selectedNumberId?: number }
}
export type IosSetupAction =
  | { action: 'status' | 'prepare' | 'cancel' | 'logout' | 'reauthorize' }
  | { action: 'login'; email: string; password: string }
  | { action: 'team'; teamId: string }
  | { action: 'code'; code: string }
  | { action: 'sms'; numberId: number }
  | { action: 'devices' | 'resend' }
export type IpcIosSetup = (action: IosSetupAction) => Promise<IosSetupState>
