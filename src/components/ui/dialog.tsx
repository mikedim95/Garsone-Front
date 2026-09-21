import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { motion, type MotionProps } from "framer-motion"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  hideCloseButton?: boolean
  motionProps?: MotionProps
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, hideCloseButton = false, motionProps, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      asChild
      data-dialog-content=""
      // Allow outside-tap close on touch/small screens, keep desktop behavior.
      onInteractOutside={(e) => {
        if (typeof window !== "undefined") {
          const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches
          const isSmall = window.matchMedia("(max-width: 768px)").matches
          if (isTouch || isSmall) return
        }
        e.preventDefault()
      }}
      {...props}
    >
      <motion.div
        initial={motionProps ? { opacity: 0, scale: 0.985, y: 8 } : false}
        animate={motionProps ? { opacity: 1, scale: 1, y: 0 } : undefined}
        transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid min-w-0 w-[calc(100%-1.5rem)] max-w-lg [translate:-50%_-50%] gap-4 rounded-2xl border border-border/40 bg-background p-5 shadow-xl max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem)] overflow-y-auto overscroll-contain",
          !motionProps && "dialog-motion",
          className
        )}
        {...motionProps}
      >
        {children}
        {!hideCloseButton && (
          <DialogPrimitive.Close className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground ring-offset-background transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </motion.div>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

// Animated form field wrapper for staggered animations
interface DialogFormFieldProps {
  className?: string;
  index?: number;
  children?: React.ReactNode;
}

const DialogFormField = ({ className, index = 0, children }: DialogFormFieldProps) => (
  <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ 
      delay: 0.05 + index * 0.05,
      duration: 0.2,
      ease: "easeOut"
    }}
    className={cn("grid gap-2", className)}
  >
    {children}
  </motion.div>
)
DialogFormField.displayName = "DialogFormField"

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex min-w-0 flex-col space-y-1.5 pr-8 text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // Sticky footer across all dialogs
      "sticky bottom-0 min-w-0 bg-background border-t border-border/40 pt-3 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end [&>button]:min-h-11 [&>button]:h-auto [&>button]:whitespace-normal [&>button]:break-words",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "min-w-0 break-words text-lg font-semibold leading-snug tracking-tight text-foreground",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("min-w-0 break-words text-sm leading-relaxed text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogFormField,
}
