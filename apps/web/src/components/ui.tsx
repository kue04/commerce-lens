import { Dialog, Tabs } from "radix-ui";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { X } from "lucide-react";

// shadcn/ui 的语义化按钮与 Radix 组合模式，按本项目设计变量适配为原生 CSS。
export function Button({
  variant = "outline",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost";
}) {
  return (
    <button className={`button button-${variant} ${className}`} {...props} />
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal-content">
          <Dialog.Title className="modal-title">{title}</Dialog.Title>
          <Dialog.Description
            className={description ? "muted modal-description" : "sr-only"}
          >
            {description ?? title}
          </Dialog.Description>
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              className="modal-close icon-button"
              aria-label="关闭弹窗"
            >
              <X size={20} />
            </Button>
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Segments({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Tabs.Root value={value} onValueChange={onChange}>
      <Tabs.List className="segments" aria-label={label}>
        {items.map((item) => (
          <Tabs.Trigger key={item.value} value={item.value} className="segment">
            {item.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}
