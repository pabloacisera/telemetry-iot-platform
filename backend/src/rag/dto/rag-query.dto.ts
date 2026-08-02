import { IsOptional, IsInt, IsString, MinLength } from 'class-validator';

/**
 * DTO for the RAG query endpoint.
 * motor_id is optional: if omitted, assumes a general question (knowledge base only).
 */
export class RagQueryDto {
  @IsOptional()
  @IsInt()
  motor_id?: number;

  @IsString()
  @MinLength(3)
  question!: string;
}
