// ─────────────────────────────────────────────────────────────────────────────
// "Edit title page": the note's title-page fields in a small form. Saving
// writes them to the note's properties with processFrontMatter (no text
// editing of the YAML), so the preview re-renders like after any edit.
// ─────────────────────────────────────────────────────────────────────────────

import { App, ButtonComponent, Modal, Notice, Setting, TFile } from "obsidian";
import { TitleFields, readTitleFields, writeTitleFields } from "../title-fields";

export class TitlePageModal extends Modal {
  private fields: TitleFields;

  constructor(app: App, private file: TFile) {
    super(app);
    this.fields = readTitleFields(app.metadataCache.getFileCache(file)?.frontmatter);
  }

  onOpen(): void {
    const f = this.fields;
    this.setTitle("Edit title page");
    this.modalEl.addClass("apdf-title-modal");
    const { contentEl } = this;
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Saved as properties of the note. An empty field is left out.",
    });

    new Setting(contentEl).setName("Title").addText((t) => t
      .setPlaceholder(this.file.basename).setValue(f.title).onChange((v) => { f.title = v; }));
    new Setting(contentEl).setName("Subtitle").addText((t) => t
      .setValue(f.subtitle).onChange((v) => { f.subtitle = v; }));
    new Setting(contentEl).setName("Authors").setDesc("One per line.").addTextArea((t) => {
      t.setValue(f.authors.join("\n")).onChange((v) => { f.authors = v.split("\n"); });
      t.inputEl.rows = 3;
    });
    new Setting(contentEl).setName("Affiliation").addText((t) => t
      .setValue(f.affiliation).onChange((v) => { f.affiliation = v; }));
    new Setting(contentEl).setName("Date").addText((t) => t
      .setPlaceholder("November 2026").setValue(f.date).onChange((v) => { f.date = v; }));
    const abs = new Setting(contentEl).setName("Abstract").setDesc("Markdown and maths, like the note.");
    abs.settingEl.addClass("apdf-title-abstract");
    abs.addTextArea((t) => {
      t.setValue(f.abstract).onChange((v) => { f.abstract = v; });
      t.inputEl.rows = 6;
    });

    const buttons = contentEl.createDiv({ cls: "modal-button-container" });
    new ButtonComponent(buttons).setButtonText("Cancel").onClick(() => this.close());
    new ButtonComponent(buttons).setButtonText("Save").setCta().onClick(() => void this.save());
  }

  private async save(): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(this.file, (fm: Record<string, unknown>) => writeTitleFields(fm, this.fields));
      this.close();
    } catch (err) {
      console.error("[academic-pdf] could not save the title page:", err);
      new Notice("Couldn't save the title page. Check that the note's properties are valid YAML.");
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
