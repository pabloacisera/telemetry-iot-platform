import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../services/api';

interface RagMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface RagState {
  messages: RagMessage[];
  loading: boolean;
}

const initialState: RagState = {
  messages: [],
  loading: false,
};

/** Send a question to the RAG module and get a response. */
export const askRag = createAsyncThunk(
  'rag/ask',
  async (params: { motorId?: number; question: string }) => {
    const response = await api.post('/rag/query', {
      motor_id: params.motorId,
      question: params.question,
    });
    return response.data as { answer: string };
  },
);

/**
 * RAG slice — conversation history with the natural language assistant.
 * Persisted only for the current session (not saved to backend).
 */
export const ragSlice = createSlice({
  name: 'rag',
  initialState,
  reducers: {
    clearConversation(state) {
      state.messages = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(askRag.pending, (state, action) => {
        state.loading = true;
        state.messages.push({
          role: 'user',
          content: action.meta.arg.question,
          timestamp: new Date().toISOString(),
        });
      })
      .addCase(askRag.fulfilled, (state, action) => {
        state.loading = false;
        state.messages.push({
          role: 'assistant',
          content: action.payload.answer,
          timestamp: new Date().toISOString(),
        });
      })
      .addCase(askRag.rejected, (state) => {
        state.loading = false;
        state.messages.push({
          role: 'assistant',
          content: 'Error: no se pudo obtener respuesta. Intentá de nuevo.',
          timestamp: new Date().toISOString(),
        });
      });
  },
});

export const { clearConversation } = ragSlice.actions;
