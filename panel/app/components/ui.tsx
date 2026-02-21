export function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,.18)",
        background:
          "linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.08))",
        boxShadow: "0 20px 60px rgba(0,0,0,.45)",
        backdropFilter: "blur(16px) saturate(140%)",
        WebkitBackdropFilter: "blur(16px) saturate(140%)",
        padding: 18,
      }}
    >
      {children}
    </div>
  );
}

export function PrimaryButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement>
) {
  return (
    <button
      {...props}
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        border: "none",
        cursor: props.disabled ? "not-allowed" : "pointer",
        fontWeight: 900,
        background: "radial-gradient(circle at 25% 20%, #ffcf6b, #fca311)",
        color: "#121212",
        opacity: props.disabled ? 0.7 : 1,
      }}
    />
  );
}

export function GhostButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement>
) {
  return (
    <button
      {...props}
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,.18)",
        cursor: props.disabled ? "not-allowed" : "pointer",
        fontWeight: 800,
        background: "rgba(255,255,255,.08)",
        color: "rgba(255,255,255,.9)",
        opacity: props.disabled ? 0.7 : 1,
      }}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        padding: "12px 12px",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,.18)",
        background: "rgba(10,15,30,.35)",
        color: "rgba(255,255,255,.92)",
        outline: "none",
      }}
    />
  );
}
