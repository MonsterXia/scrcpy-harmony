// Resolve Node-API from the running Electron executable, including renamed apps.
// This follows node-gyp's win_delay_load_hook contract (MIT licensed).
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <delayimp.h>
#include <cstring>

static FARPROC WINAPI resolve_node_host(unsigned event, DelayLoadInfo* info) {
    if (event != dliNotePreLoadLibrary) return nullptr;
    if (_stricmp(info->szDll, "node.exe") && _stricmp(info->szDll, "node.dll")) return nullptr;
    return reinterpret_cast<FARPROC>(GetModuleHandleW(nullptr));
}
decltype(__pfnDliNotifyHook2) __pfnDliNotifyHook2 = resolve_node_host;
#endif
