import {
  IsOptional,
  IsInt,
  IsString,
  MinLength,
  IsArray,
} from 'class-validator';

/**
 * DTO for the RAG query endpoint.
 * motor_id is optional: if omitted, assumes a general question (knowledge base only).
 * history carries the recent conversation turns so the assistant can answer follow-ups.
 */
export class RagQueryDto {
  @IsOptional()
  @IsInt()
  motor_id?: number;

  @IsString()
  @MinLength(3)
  question!: string;

  @IsOptional()
  @IsArray()
  history?: { role: 'user' | 'assistant'; content: string }[];
}
