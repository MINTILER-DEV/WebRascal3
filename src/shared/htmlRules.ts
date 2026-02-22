export type HtmlRule = {
  attr: string;
  fn: (value: string) => string | null;
};

export const htmlRules: HtmlRule[] = [
  {
    attr: "integrity",
    fn: () => ""
  },
  {
    attr: "nonce",
    fn: () => null
  },
  {
    attr: "csp",
    fn: () => null
  },
  {
    attr: "credentialless",
    fn: () => null
  }
];