import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptToken, decryptToken } from "./google-calendar";

/**
 * 구글 캘린더 연동 어댑터 단위테스트(계획 3단계). 이 모듈은 네트워크 호출을
 * 포함하므로(insert/patch/delete/refreshAccessToken) 목업 없이는 단위테스트
 * 대상에서 제외한다(계획서 참고 — 실계정 E2E로 검증). 여기서는 순수하게
 * 검증 가능한 토큰 암호화 라운드트립·변조 감지·키 길이 검증만 커버한다.
 */
const VALID_KEY = Buffer.alloc(32, 7).toString("base64");

describe("encryptToken / decryptToken", () => {
  const original = process.env.GOOGLE_TOKEN_ENC_KEY;

  beforeEach(() => {
    process.env.GOOGLE_TOKEN_ENC_KEY = VALID_KEY;
  });

  afterEach(() => {
    process.env.GOOGLE_TOKEN_ENC_KEY = original;
  });

  it("라운드트립 — 암호화 후 복호화하면 원문 복원", () => {
    const plaintext = "1//0gExampleRefreshToken";
    const ciphertext = encryptToken(plaintext);
    expect(decryptToken(ciphertext)).toBe(plaintext);
  });

  it("매 호출마다 다른 iv를 사용해 같은 평문도 다른 암호문 생성", () => {
    const a = encryptToken("same-token");
    const b = encryptToken("same-token");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe("same-token");
    expect(decryptToken(b)).toBe("same-token");
  });

  it("변조된 암호문(ciphertext 일부 변경)은 복호화 시 throw", () => {
    const ciphertext = encryptToken("secret-value");
    const [iv, tag, data] = ciphertext.split(":");
    const tampered = Buffer.from(data, "base64");
    tampered[0] ^= 0xff;
    const corrupted = [iv, tag, tampered.toString("base64")].join(":");
    expect(() => decryptToken(corrupted)).toThrow();
  });

  it("변조된 authTag는 복호화 시 throw", () => {
    const ciphertext = encryptToken("secret-value");
    const [iv, tag, data] = ciphertext.split(":");
    const tamperedTag = Buffer.from(tag, "base64");
    tamperedTag[0] ^= 0xff;
    const corrupted = [iv, tamperedTag.toString("base64"), data].join(":");
    expect(() => decryptToken(corrupted)).toThrow();
  });

  it("형식이 깨진 암호문은 복호화 시 throw", () => {
    expect(() => decryptToken("not-a-valid-format")).toThrow();
  });

  it("잘못된 키 길이는 encrypt 호출 시 throw", () => {
    process.env.GOOGLE_TOKEN_ENC_KEY = Buffer.alloc(16).toString("base64");
    expect(() => encryptToken("value")).toThrow();
  });

  it("잘못된 키 길이는 decrypt 호출 시 throw", () => {
    const ciphertext = encryptToken("value");
    process.env.GOOGLE_TOKEN_ENC_KEY = Buffer.alloc(16).toString("base64");
    expect(() => decryptToken(ciphertext)).toThrow();
  });

  it("키 미설정이면 throw", () => {
    delete process.env.GOOGLE_TOKEN_ENC_KEY;
    expect(() => encryptToken("value")).toThrow();
  });
});
