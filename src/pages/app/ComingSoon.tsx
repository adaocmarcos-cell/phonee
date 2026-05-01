import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Construction } from "lucide-react";

export default function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <Card className="p-16 bg-card border-border text-center bg-grid">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-xl bg-primary/10 text-primary mb-4">
          <Construction className="h-6 w-6" />
        </div>
        <h3 className="font-semibold mb-1">Em construção</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Este módulo será entregue na próxima sprint. O núcleo (auth, estoque, vendas, alertas e dashboard) já está totalmente funcional.
        </p>
      </Card>
    </div>
  );
}