// Teach React's JSX about our custom element so <dom-stepper> type-checks.
import type {} from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "dom-stepper": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { value?: string },
        HTMLElement
      >;
    }
  }
}
