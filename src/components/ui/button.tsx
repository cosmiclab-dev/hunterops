import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Apple's button grammar: a solid Action Blue pill for the main action, a
// ghost pill outlined in blue for the second, a pearl capsule for utility.
// Every button presses in to 95%; none has a shadow or a gradient.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-[15px] font-normal tracking-[-0.016em] transition-[transform,background-color,color,border-color] duration-150 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-primary text-primary hover:bg-primary/[0.06]',
        secondary: 'border border-black/[0.06] bg-secondary text-secondary-foreground hover:bg-accent dark:border-white/[0.08]',
        soft: 'bg-primary/[0.08] text-primary hover:bg-primary/[0.12]',
        ghost: 'text-primary hover:bg-primary/[0.08]',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-[22px] text-[17px]',
        sm: 'h-9 px-4 text-[14px]',
        lg: 'h-12 px-7 text-[18px] font-light',
        icon: 'h-11 w-11',
        'icon-sm': 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
