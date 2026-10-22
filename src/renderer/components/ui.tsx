import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
const variants = cva('button', { variants: { variant: { default: 'button-primary', outline: 'button-outline', ghost: 'button-ghost', danger: 'button-danger' } }, defaultVariants: { variant: 'default' } });
export function Button({ className, variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>) { return <button className={cn(variants({ variant }), className)} {...props}/>; }
export function Switch(props: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) { return <SwitchPrimitive.Root className="switch" {...props}><SwitchPrimitive.Thumb className="switch-thumb"/></SwitchPrimitive.Root>; }
