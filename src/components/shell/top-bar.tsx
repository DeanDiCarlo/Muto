'use client'

import Link from 'next/link'
import { LogOut, User as UserIcon } from 'lucide-react'
import { Breadcrumbs } from './breadcrumbs'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type ShellUser = {
  id: string
  name: string
  email?: string
}

/**
 * Sticky top bar (~56px). Breadcrumbs on the left, user menu on the right.
 * The user-menu sign-out is wired to a /logout route that the auth stub (T4)
 * will implement; until then it's a placeholder link.
 */
export function TopBar({ user }: { user?: ShellUser }) {
  const initials = user?.name
    ? user.name
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('')
    : '?'

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-foreground/10 bg-background/80 px-4 backdrop-blur-sm sm:px-6">
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 px-2"
              aria-label="User menu"
            >
              <span
                className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground/80"
                aria-hidden
              >
                {initials}
              </span>
              <span className="hidden text-sm font-medium sm:inline max-w-[12rem] truncate">
                {user?.name ?? 'Sign in'}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {user ? (
              <>
                <DropdownMenuLabel className="flex flex-col">
                  <span className="text-sm font-medium truncate">
                    {user.name}
                  </span>
                  {user.email && (
                    <span className="text-xs font-normal text-muted-foreground truncate">
                      {user.email}
                    </span>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/logout">
                    <LogOut className="size-4" /> Sign out
                  </Link>
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem asChild>
                <Link href="/login">
                  <UserIcon className="size-4" /> Sign in
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
