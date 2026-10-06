import { describe, expect, it } from "vitest";
import { esCelularOTableta, esComputadora, type InfoNavegador } from "./dispositivo";

const UA = {
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  linux: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  tabletaAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  ipadViejo:
    "Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1",
};

const pc = (o: Partial<InfoNavegador> = {}): InfoNavegador => ({ userAgent: UA.windows, platform: "Win32", maxTouchPoints: 0, ...o });

describe("esCelularOTableta", () => {
  it("computadoras: no", () => {
    expect(esCelularOTableta(pc())).toBe(false);
    expect(esCelularOTableta(pc({ userAgentData: { mobile: false } }))).toBe(false);
    expect(esCelularOTableta({ userAgent: UA.mac, platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
    expect(esCelularOTableta({ userAgent: UA.linux, platform: "Linux x86_64" })).toBe(false);
    // Laptop con pantalla táctil (Windows): sigue siendo computadora.
    expect(esCelularOTableta(pc({ maxTouchPoints: 10 }))).toBe(false);
  });

  it("Client Hints: mobile = true manda", () => {
    expect(esCelularOTableta(pc({ userAgentData: { mobile: true } }))).toBe(true);
  });

  it("celulares y tabletas por el user agent", () => {
    expect(esCelularOTableta({ userAgent: UA.android, userAgentData: { mobile: true } })).toBe(true);
    expect(esCelularOTableta({ userAgent: UA.android })).toBe(true);
    // Tableta Android: Client Hints dice mobile: false, pero el user agent dice Android.
    expect(esCelularOTableta({ userAgent: UA.tabletaAndroid, userAgentData: { mobile: false } })).toBe(true);
    expect(esCelularOTableta({ userAgent: UA.iphone, platform: "iPhone", maxTouchPoints: 5 })).toBe(true);
    expect(esCelularOTableta({ userAgent: UA.ipadViejo, platform: "iPad", maxTouchPoints: 5 })).toBe(true);
  });

  it("iPadOS que se presenta como Mac: tableta", () => {
    expect(esCelularOTableta({ userAgent: UA.mac, platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
  });
});

describe("esComputadora", () => {
  it("necesita computadora y pantalla grande", () => {
    expect(esComputadora(pc(), true)).toBe(true);
    expect(esComputadora(pc(), false)).toBe(false); // ventana angosta
    expect(esComputadora({ userAgent: UA.tabletaAndroid }, true)).toBe(false); // tableta horizontal
    expect(esComputadora({ userAgent: UA.mac, platform: "MacIntel", maxTouchPoints: 5 }, true)).toBe(false);
  });
});
