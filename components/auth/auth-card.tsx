import Image from "next/image";

export function AuthCard({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <main className="wall-grid flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3 text-cream">
          <Image src="/grid-logo.png" alt="" width={40} height={40} className="rounded-md bg-cream p-1" priority />
          <div>
            <p className="font-display text-xl leading-tight">Grid Agentic</p>
            <p className="text-xs text-mist">GRID Property Ventures</p>
          </div>
        </div>
        <section className="card p-6">
          <h1 className="text-2xl">{title}</h1>
          {lead && <p className="mt-1 text-sm text-muted">{lead}</p>}
          <div className="mt-5">{children}</div>
        </section>
        <p className="mt-4 text-center text-xs text-mist">For GRID staff. Activity is logged. Keep client IDs, TINs and bank details out of AI chats.</p>
      </div>
    </main>
  );
}
