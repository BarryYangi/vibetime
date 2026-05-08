'use client'

import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import type * as React from 'react'
import { cn } from '@/lib/utils'

export type SwitchProps = React.ComponentProps<typeof SwitchPrimitive.Root>

export function Switch({ className, disabled, ...props }: SwitchProps): React.ReactElement {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-input bg-muted shadow-xs/5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background data-[checked]:border-primary data-[checked]:bg-primary data-[disabled]:opacity-64',
        className,
      )}
      data-slot="switch"
      disabled={disabled}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className="block size-4 translate-x-0.5 rounded-full bg-background shadow-sm ring-0 transition-transform data-[checked]:translate-x-4"
        data-slot="switch-thumb"
      />
    </SwitchPrimitive.Root>
  )
}

export { SwitchPrimitive }
