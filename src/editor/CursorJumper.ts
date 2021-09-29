import {
    App,
    EditorPosition,
    EditorRangeOrCaret,
    EditorTransaction,
    MarkdownView,
} from "obsidian";
import { escape_RegExp } from "Utils";

export class CursorJumper {
    constructor(private app: App) {}

    async jump_to_next_cursor_location(): Promise<void> {
        const active_view =
            this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!active_view) {
            return;
        }
        const active_file = active_view.file;
        await active_view.save();

        const content = await this.app.vault.read(active_file);

        const { new_content, positions } =
            this.replace_and_get_cursor_positions(content);
        if (positions) {
            await this.app.vault.modify(active_file, new_content);
            this.set_cursor_location(positions);
        }
    }

    get_editor_position_from_index(
        content: string,
        index: number
    ): EditorPosition {
        const substr = content.substr(0, index);

        let l = 0;
        let offset = -1;
        let r = -1;
        for (; (r = substr.indexOf("\n", r + 1)) !== -1; l++, offset = r);
        offset += 1;

        const ch = content.substr(offset, index - offset).length;

        return { line: l, ch: ch };
    }

    replace_and_get_cursor_positions(content: string): {
        new_content?: string;
        positions?: EditorPosition[];
    } {
        let cursor_matches = [];
        let match;
        const cursor_regex: RegExp = new RegExp(
            "<%\\s*tp.file.cursor\\((?<order>[0-9]{0,2})\\)\\s*%>",
            "g"
        );

        while ((match = cursor_regex.exec(content)) != null) {
            cursor_matches.push(match);
        }
        if (cursor_matches.length === 0) {
            return {};
        }

        cursor_matches.sort((m1, m2) => {
            return Number(m1.groups["order"]) - Number(m2.groups["order"]);
        });
        const match_str = cursor_matches[0][0];

        cursor_matches = cursor_matches.filter((m) => {
            return m[0] === match_str;
        });

        const positions = [];
        let index_offset = 0;
        for (let match of cursor_matches) {
            const index = match.index - index_offset;
            positions.push(this.get_editor_position_from_index(content, index));

            content = content.replace(new RegExp(escape_RegExp(match[0])), "");
            index_offset += match[0].length;

            // For tp.file.cursor(), we keep the default top to bottom
            if (match[1] === "") {
                break;
            }
        }

        return { new_content: content, positions: positions };
    }

    set_cursor_location(positions: EditorPosition[]): void {
        const active_view =
            this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!active_view) {
            return;
        }

        const editor = active_view.editor;
        editor.focus();

        let selections: Array<EditorRangeOrCaret> = [];
        for (let pos of positions) {
            selections.push({ from: pos });
        }

        let transaction: EditorTransaction = {
            selections: selections,
        };
        editor.transaction(transaction);
    }
}
