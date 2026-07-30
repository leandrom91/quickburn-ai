import { ScheduleTools } from './schedule.tools';

describe('ScheduleTools - Regla Deportiva RN-01', () => {
  let scheduleTools: ScheduleTools;
  let mockFirestoreService: any;
  let mockLogger: any;

  beforeEach(() => {
    mockFirestoreService = {
      getUserProfile: jest.fn().mockResolvedValue({
        agenda: { proximo_entreno: '2026-07-28T10:00:00.000Z' },
      }),
      saveUserProfile: jest.fn().mockResolvedValue(undefined),
    };

    mockLogger = {
      logToolCall: jest.fn(),
      logToolResult: jest.fn(),
    };

    scheduleTools = new ScheduleTools(mockFirestoreService, mockLogger);
  });

  it('debe RECHAZAR la reprogramación si el descanso es menor a 36h (< 36h)', async () => {
    const lastWorkout = '2026-07-28T10:00:00.000Z';
    const proposed = '2026-07-28T20:00:00.000Z'; // Solo 10 horas después

    const result = await scheduleTools.checkRestWindowValidity(lastWorkout, proposed);

    expect(result.restValid).toBe(false);
    expect(result.diferencia_horas).toBe(10);
    expect(result.mensaje).toContain('Violación de Regla Deportiva RN-01');
  });

  it('debe APROBAR la reprogramación si el descanso es de al menos 36h (>= 36h)', async () => {
    const lastWorkout = '2026-07-28T10:00:00.000Z';
    const proposed = '2026-07-30T00:00:00.000Z'; // 38 horas después

    const result = await scheduleTools.checkRestWindowValidity(lastWorkout, proposed);

    expect(result.restValid).toBe(true);
    expect(result.diferencia_horas).toBe(38);
    expect(result.mensaje).toContain('Ventana de descanso respetada correctamente');
  });
});
