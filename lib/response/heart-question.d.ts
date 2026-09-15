import { Format } from 'alemonjs';
import { type HeartTicket } from '../game/heart-question.service';
export declare const heartQuestionFormat: (ticket: HeartTicket) => Format;
export declare const openHeartQuestionHandler: () => Promise<void>;
export declare const heartAnswerHandler: () => Promise<void>;
export declare const heartSkipHandler: () => Promise<void>;
