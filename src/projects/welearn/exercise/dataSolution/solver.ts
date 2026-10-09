import { store } from "@src/store";
import { sleep } from "@src/utils";
import { fillDataSolutionBlank } from "./adapter";

export async function solveDataSolution(answers: any[]) {
    const inputOnPaper = document.querySelectorAll("input[data-itemtype]") as NodeListOf<
        HTMLInputElement
    >;
    let inputOrder = 0;

    for (const answer of answers) {
        await sleep(store.userSettings.solveInterval);
        switch (answer.type) {
            case "blank":
                fillDataSolutionBlank(answer.element, inputOnPaper[inputOrder], answer.text);

                inputOrder++;
                break;
            case "choice":
                answer.element.click();

                break;
        }
    }
}
