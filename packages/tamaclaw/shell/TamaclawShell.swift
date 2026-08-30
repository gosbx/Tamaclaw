// Tamaclaw Shell — native macOS window hosting the display app.
// Borderless, fills a chosen screen (great for a small secondary monitor),
// keeps retrying until the bridge is up, and repositions itself when the
// screen layout changes. Build: scripts/build-shell.sh (just swiftc, no Xcode).
//
// Env:
//   TAMACLAW_URL     display URL        (default http://localhost:4321)
//   TAMACLAW_SCREEN  screen index, or "main" / "secondary"  (default: secondary if present)
//   TAMACLAW_FLOAT   "1" → always on top
//   TAMACLAW_WINDOW  "1" → normal resizable window instead of fullscreen-borderless

import Cocoa
import WebKit

let env = ProcessInfo.processInfo.environment
let displayURL = URL(string: env["TAMACLAW_URL"] ?? "http://localhost:4321")!
let windowed = env["TAMACLAW_WINDOW"] == "1"

func pickScreen() -> NSScreen {
    let screens = NSScreen.screens
    guard !screens.isEmpty else { fatalError("no screens") }
    switch env["TAMACLAW_SCREEN"] {
    case .some("main"):
        return NSScreen.main ?? screens[0]
    case .some(let raw):
        if let i = Int(raw), i >= 0, i < screens.count { return screens[i] }
        fallthrough
    default:
        // default: the companion lives on the secondary monitor when there is one
        if screens.count > 1, let secondary = screens.first(where: { $0 != screens[0] }) {
            return secondary
        }
        return screens[0]
    }
}

final class Delegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!

    func applicationDidFinishLaunching(_ note: Notification) {
        let screen = pickScreen()
        let style: NSWindow.StyleMask = windowed ? [.titled, .closable, .resizable, .miniaturizable] : [.borderless]
        let frame = windowed
            ? NSRect(x: screen.frame.midX - 400, y: screen.frame.midY - 240, width: 800, height: 480)
            : screen.frame

        window = NSWindow(contentRect: frame, styleMask: style, backing: .buffered, defer: false, screen: screen)
        window.title = "Tamaclaw"
        window.backgroundColor = .black
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        if env["TAMACLAW_FLOAT"] == "1" { window.level = .floating }

        let cfg = WKWebViewConfiguration()
        cfg.mediaTypesRequiringUserActionForPlayback = []
        webView = WKWebView(frame: window.contentView!.bounds, configuration: cfg)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground") // let the page paint
        window.contentView!.addSubview(webView)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        load()

        // follow screen (dis)connections / resolution changes
        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self, !windowed else { return }
            self.window.setFrame(pickScreen().frame, display: true)
        }
    }

    func load() { webView.load(URLRequest(url: displayURL)) }

    func retrySoon() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.load() }
    }

    // bridge not up yet (or restarting) — keep knocking
    func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { retrySoon() }
    func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { retrySoon() }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
// kiosk-style: no dock icon / no menu bar takeover unless running windowed
app.setActivationPolicy(windowed ? .regular : .accessory)
let delegate = Delegate()
app.delegate = delegate
app.run()
