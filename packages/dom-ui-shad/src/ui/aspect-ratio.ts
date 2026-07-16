// shad <shad-aspect-ratio> — constrains its content to a given width/height
// ratio. The slotted child (an image, video, or any box) fills the frame.
//   <shad-aspect-ratio ratio="1.7777"><img src="…" /></shad-aspect-ratio>

import { Component, html, css, styleMap } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

@Component.define()
export class ShadAspectRatio extends Component("shad-aspect-ratio") {
  static styles = [
    tw,
    css`
      :host { display: block; }
      .ratio { width: 100%; }
      ::slotted(*) { display: block; width: 100%; height: 100%; }
      ::slotted(img), ::slotted(video) { object-fit: cover; }
    `,
  ];

  /** Width / height ratio, e.g. 16/9 ≈ 1.78, 1 (square), 3/4 = 0.75 (portrait). */
  @Component.prop({ attribute: true }) ratio = 16 / 9;

  override render() {
    return html`<div class="ratio" style=${styleMap({ aspectRatio: String(this.ratio) })}><slot></slot></div>`;
  }
}
