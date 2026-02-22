export class WebrascalHeaders extends Headers {
  clone(): WebrascalHeaders {
    return new WebrascalHeaders(this);
  }

  toJSON(): Record<string, string> {
    const out: Record<string, string> = {};
    this.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
}