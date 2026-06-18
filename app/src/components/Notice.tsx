import { txUrl } from "../lib/format";

export type NoticeState = {
  kind: "ok" | "err";
  text: string;
  digest?: string;
  network?: "testnet" | "mainnet";
};

export function Notice({
  kind,
  text,
  digest,
  network = "testnet",
}: NoticeState) {
  return (
    <div className={`note ${kind}`}>
      {text}
      {kind === "ok" && " ✓"}
      {digest && (
        <>
          {" · "}
          <a href={txUrl(digest, network)} target="_blank" rel="noreferrer">
            View on explorer
          </a>
        </>
      )}
    </div>
  );
}
