import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn(className)}>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        {icon && (
          <div className="text-muted-foreground" aria-hidden>
            {icon}
          </div>
        )}
        <div className="space-y-1 max-w-sm">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action && <div className="mt-2">{action}</div>}
      </CardContent>
    </Card>
  )
}
