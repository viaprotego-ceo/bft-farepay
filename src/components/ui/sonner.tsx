import { Toaster as Sonner } from "sonner";

function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      duration={2200}
      toastOptions={{
        classNames: {
          toast: "font-sans bg-navy text-navy-foreground border-transparent",
        },
      }}
    />
  );
}

export { Toaster };
