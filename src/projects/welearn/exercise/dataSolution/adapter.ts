export interface DataSolutionAnswer {
    text: string;
    type: "blank" | "choice";
    element: HTMLElement;
    index: number;
}

export function parseDataSolutionDom(dom: ParentNode): DataSolutionAnswer[] {
    return Array.from(dom.querySelectorAll<HTMLElement>("[data-solution]")).map(
        (element, index) => {
            let text = element.getAttribute("data-solution") ?? "";
            const type: DataSolutionAnswer["type"] = text ? "blank" : "choice";
            if (!text) {
                text = element.firstElementChild?.textContent || element.textContent || "";
            }
            return { text, type, element, index: index + 1 };
        },
    );
}

export function writeTextareaAnswer(element: HTMLElement, text: string): void {
    if (element.tagName.toLowerCase() !== "textarea") {
        throw new Error("Expected a textarea answer field");
    }
    const target = element as HTMLTextAreaElement;
    const EventCtor = target.ownerDocument.defaultView?.Event;
    if (!EventCtor) throw new Error("Textarea has no owning window");

    target.focus();
    target.value = text;
    target.dispatchEvent(new EventCtor("input", { bubbles: true }));
    target.dispatchEvent(new EventCtor("change", { bubbles: true }));
}

export function fillDataSolutionBlank(
    answerElement: HTMLElement,
    fallbackInput: HTMLInputElement | undefined,
    text: string,
): void {
    if (
        answerElement.tagName.toLowerCase() === "textarea" &&
        answerElement.hasAttribute("data-itemtype")
    ) {
        writeTextareaAnswer(answerElement, text);
        return;
    }
    if (!fallbackInput) throw new Error("No input control found for blank answer");
    fallbackInput.value = text;
}
