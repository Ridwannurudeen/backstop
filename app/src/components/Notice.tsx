import { txUrl, type SuiExplorerNetwork } from "../lib/format";

export type NoticeState = {
  kind: "ok" | "err";
  text: string;
  digest?: string;
  network?: SuiExplorerNetwork;
};

export function Notice({ kind, text, digest, network }: NoticeState) {
  return (
    <div className={`note ${kind}`}>
      {text}
      {kind === "ok" && " ✓"}
      {digest && (
        <>
          {" · "}
          <a href={txUrl(digest, network)} target="_blank" rel="noreferrer">
            View on SuiVision ↗
          </a>
        </>
      )}
    </div>
  );
}
