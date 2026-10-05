type ConnectionOptions = {
  url: () => string | null;
  enabled: () => boolean;
  create: (url: string) => WebSocket;
  status: (connected: boolean) => void;
  message: (event: MessageEvent) => void;
  delay?: number;
};

export class RealtimeConnection {
  private options: ConnectionOptions;
  private socket: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private wanted = false;
  private currentUrl: string | null = null;
  private connected = false;

  constructor(options: ConnectionOptions) { this.options = options; }
  isConnected() { return this.connected; }
  private setStatus(value: boolean) {
    if (this.connected === value) return;
    this.connected = value;
    this.options.status(value);
  }
  private closeSocket() {
    const previous = this.socket;
    this.socket = null; // Invalidate old handlers before close can fire.
    this.currentUrl = null;
    clearTimeout(this.deadline);
    this.deadline = undefined;
    try { previous?.close(); } catch { /* Already closed. */ }
    this.setStatus(false);
  }
  private schedule() {
    if (!this.wanted || !this.options.enabled() || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.connect();
    }, this.options.delay ?? 2500);
  }
  connect() {
    this.wanted = true;
    if (!this.options.enabled()) return;
    const url = this.options.url();
    if (!url) { this.suspend(); return; }
    if (this.socket && this.currentUrl === url && this.socket.readyState <= 1) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.closeSocket();
    try {
      const socket = this.options.create(url);
      this.socket = socket;
      this.currentUrl = url;
      const lost = () => {
        if (this.socket !== socket) return;
        this.closeSocket();
        this.schedule();
      };
      socket.addEventListener("open", () => {
        if (this.socket !== socket || !this.wanted) return;
        clearTimeout(this.deadline);
        this.deadline = undefined;
        this.setStatus(true);
      });
      socket.addEventListener("message", event => {
        if (this.socket === socket && this.wanted) this.options.message(event);
      });
      socket.addEventListener("close", lost);
      socket.addEventListener("error", lost);
      this.deadline = setTimeout(lost, 15_000);
    } catch {
      this.closeSocket();
      this.schedule();
    }
  }
  refresh() {
    if (this.wanted) this.connect();
  }
  suspend() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.closeSocket();
  }
  disconnect() {
    this.wanted = false;
    this.suspend();
  }
  send(data: string) {
    if (this.socket?.readyState === 1) this.socket.send(data);
  }
}
