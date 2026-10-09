import logger from "@/src/utils/logger";
import { Answer } from "../main";
import { parseDataSolutionDom } from "./adapter";

export function parseDataSolution() {
    const answers = parseDataSolutionDom(document) as Answer[];
    logger.debug(answers);
    return answers;
}
