export class NavigateEvent extends Event {
  url: URL;
  constructor(url: URL) {
    super("navigate", { cancelable: true });
    this.url = url;
  }
}

export class UrlChangeEvent extends Event {
  url: URL;
  constructor(url: URL) {
    super("urlchange");
    this.url = url;
  }
}

export class WebrascalContextEvent extends Event {
  constructor() {
    super("webrascalcontext");
  }
}