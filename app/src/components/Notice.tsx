import { txUrl } from "../lib/format";

export type NoticeState = {
  kind: "ok" | "err";
  text: string;
  digest?: string;
};

export function Notice({ kind, text, digest }: NoticeState) {
  return (
    <div className={`note ${kind}`}>
      {text}
      {kind === "ok" && " ✓"}
      {digest && (
        <>
          {" · "}
          <a href={txUrl(digest)} target="_blank" rel="noreferrer">
            View on SuiVision ↗
          </a>
        </>
      )}
    </div>
  );
}
