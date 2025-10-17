/**
 * 청크 기반 지연 로딩 시스템
 * 대용량 데이터를 작은 단위로 나누어 점진적으로 로드
 */

export interface ChunkConfig {
  chunkSize: number; // 한 번에 처리할 스트로크 수
  delayMs: number; // 청크 간 지연 시간 (ms)
  maxConcurrentChunks: number; // 동시 처리할 최대 청크 수
}

export interface ChunkProgress {
  loaded: number;
  total: number;
  percentage: number;
  isComplete: boolean;
}

export class ChunkedLoader {
  private config: ChunkConfig;
  private onProgress?: (progress: ChunkProgress) => void;
  private onComplete?: (data: any[]) => void;
  private onError?: (error: Error) => void;

  constructor(config: Partial<ChunkConfig> = {}) {
    this.config = {
      chunkSize: 50, // 기본 50개씩 처리
      delayMs: 16, // 16ms (60fps 유지)
      maxConcurrentChunks: 2,
      ...config,
    };
  }

  async loadData<T>(
    data: T[],
    processor: (chunk: T[]) => T[],
    callbacks: {
      onProgress?: (progress: ChunkProgress) => void;
      onComplete?: (data: T[]) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<T[]> {
    this.onProgress = callbacks.onProgress;
    this.onComplete = callbacks.onComplete;
    this.onError = callbacks.onError;

    const chunks = this.createChunks(data, this.config.chunkSize);
    const results: T[] = [];
    let processedChunks = 0;

    try {
      for (let i = 0; i < chunks.length; i += this.config.maxConcurrentChunks) {
        const batch = chunks.slice(i, i + this.config.maxConcurrentChunks);

        // 병렬로 청크 처리
        const batchPromises = batch.map(async (chunk, index) => {
          await this.delay(this.config.delayMs * index); // 청크 간 지연
          return processor(chunk);
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.flat());

        processedChunks += batch.length;

        // 진행률 업데이트
        const progress: ChunkProgress = {
          loaded: processedChunks,
          total: chunks.length,
          percentage: (processedChunks / chunks.length) * 100,
          isComplete: processedChunks === chunks.length,
        };

        this.onProgress?.(progress);

        // 다음 배치 전 짧은 지연
        if (i + this.config.maxConcurrentChunks < chunks.length) {
          await this.delay(this.config.delayMs);
        }
      }

      this.onComplete?.(results);
      return results;
    } catch (error) {
      this.onError?.(error as Error);
      throw error;
    }
  }

  private createChunks<T>(data: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 우선순위 기반 로딩 (중요한 스트로크부터 먼저 로드)
  async loadWithPriority<T>(
    data: T[],
    priorityFn: (item: T) => number,
    processor: (chunk: T[]) => T[],
    callbacks: {
      onProgress?: (progress: ChunkProgress) => void;
      onComplete?: (data: T[]) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<T[]> {
    // 우선순위에 따라 정렬
    const sortedData = [...data].sort((a, b) => priorityFn(b) - priorityFn(a));
    return this.loadData(sortedData, processor, callbacks);
  }
}
