export default function ProfessorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-muted/40 p-4">
        <h2 className="text-lg font-semibold mb-4">Muto</h2>
        <nav className="space-y-2 text-sm text-muted-foreground">
          <p>Dashboard</p>
          <p>Courses</p>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
