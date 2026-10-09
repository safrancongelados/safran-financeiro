import { ChevronDown, ChevronUp } from "lucide-react";

/** Setas ↑↓ de ordenação. Formulário puro: funciona sem JavaScript no cliente. */
export function Mover({
  id,
  action,
  primeiro,
  ultimo,
}: {
  id: string;
  action: (formData: FormData) => Promise<void>;
  primeiro: boolean;
  ultimo: boolean;
}) {
  const botao =
    "flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-25";
  return (
    <form action={action} className="flex shrink-0 flex-col">
      <input type="hidden" name="id" value={id} />
      <button type="submit" name="direcao" value="cima" disabled={primeiro} aria-label="Subir" className={botao}>
        <ChevronUp className="size-3.5" />
      </button>
      <button type="submit" name="direcao" value="baixo" disabled={ultimo} aria-label="Descer" className={botao}>
        <ChevronDown className="size-3.5" />
      </button>
    </form>
  );
}
