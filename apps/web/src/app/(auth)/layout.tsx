export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xl mb-4">
            M
          </div>
          <h1 className="text-2xl font-bold">Mass Page Creator</h1>
          <p className="text-muted-foreground text-sm mt-1">Programmatic SEO at scale</p>
        </div>
        {children}
      </div>
    </div>
  );
}
