"use client";

/** Último recurso: erro no layout raiz. Sem CSS do app, então estilo inline. */
export default function ErroGeral({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#faf7f2", color: "#271f30" }}>
        <div style={{ maxWidth: 420, margin: "80px auto", padding: "0 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 18 }}>Não foi possível carregar o sistema</h1>
          <p style={{ fontSize: 14, color: "#4f4350" }}>Tente de novo em instantes.</p>
          {error.digest ? <p style={{ fontSize: 12, fontFamily: "monospace" }}>código: {error.digest}</p> : null}
          <button
            onClick={() => reset()}
            style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, border: 0, background: "#842a9b", color: "#fff" }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
