import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { de } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            S
          </div>
          <h1 className="text-xl font-semibold text-foreground">Safran · Financeiro</h1>
          <p className="mt-1 text-sm text-muted-foreground">DRE e fluxo de caixa</p>
        </div>
        <Card>
          <CardContent className="pt-5">
            <LoginForm de={typeof de === "string" ? de : undefined} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
