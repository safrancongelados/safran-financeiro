import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { SenhaForm } from "./senha-form";

export default function SenhaPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Trocar senha" />
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Nova senha</CardTitle>
        </CardHeader>
        <CardContent>
          <SenhaForm />
        </CardContent>
      </Card>
    </div>
  );
}
