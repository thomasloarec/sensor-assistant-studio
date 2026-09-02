import { requireSupabase } from "./supabase";
import type {
  MessageRole,
  SensorTestInternalTrace,
  SensorTestMessage,
  SensorTestOutput,
  SensorTestReview,
  SensorTestScenario,
  SensorTestSession,
} from "./types";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchScenarios(): Promise<SensorTestScenario[]> {
  const sb = requireSupabase();
  return unwrap(
    await sb
      .from("sensor_test_scenarios")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .order("scenario_id", { ascending: true }),
  );
}

export async function fetchSessions(): Promise<SensorTestSession[]> {
  const sb = requireSupabase();
  return unwrap(
    await sb
      .from("sensor_test_sessions")
      .select("*")
      .order("created_at", { ascending: false }),
  );
}

export async function createSession(
  userId: string,
  patch: Partial<SensorTestSession> = {},
): Promise<SensorTestSession> {
  const sb = requireSupabase();
  return unwrap(
    await sb
      .from("sensor_test_sessions")
      .insert({ user_id: userId, ...patch })
      .select("*")
      .single(),
  );
}

export async function updateSession(
  id: string,
  patch: Partial<SensorTestSession>,
): Promise<SensorTestSession> {
  const sb = requireSupabase();
  return unwrap(
    await sb
      .from("sensor_test_sessions")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single(),
  );
}

export async function fetchMessages(sessionId: string): Promise<SensorTestMessage[]> {
  const sb = requireSupabase();
  return unwrap(
    await sb
      .from("sensor_test_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: true }),
  );
}

export async function insertMessage(input: {
  session_id: string;
  role: MessageRole;
  content: string;
  turn_index: number;
}): Promise<SensorTestMessage> {
  const sb = requireSupabase();
  return unwrap(await sb.from("sensor_test_messages").insert(input).select("*").single());
}

export async function fetchOutputs(sessionId: string): Promise<SensorTestOutput[]> {
  const sb = requireSupabase();
  return unwrap(
    await sb
      .from("sensor_test_outputs")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false }),
  );
}

export async function fetchTraces(sessionId: string): Promise<SensorTestInternalTrace[]> {
  const sb = requireSupabase();
  return unwrap(
    await sb
      .from("sensor_test_internal_traces")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false }),
  );
}

export async function fetchReviews(sessionId: string): Promise<SensorTestReview[]> {
  const sb = requireSupabase();
  return unwrap(
    await sb
      .from("sensor_test_reviews")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false }),
  );
}

export async function insertReview(
  input: Partial<SensorTestReview> & { session_id: string; reviewer_id: string },
): Promise<SensorTestReview> {
  const sb = requireSupabase();
  return unwrap(await sb.from("sensor_test_reviews").insert(input).select("*").single());
}

export async function insertOutput(
  input: Partial<SensorTestOutput> & { session_id: string; output_type: string; customer_summary: string },
): Promise<SensorTestOutput> {
  const sb = requireSupabase();
  return unwrap(await sb.from("sensor_test_outputs").insert(input).select("*").single());
}

export async function insertTrace(
  input: Partial<SensorTestInternalTrace> & { session_id: string },
): Promise<SensorTestInternalTrace> {
  const sb = requireSupabase();
  return unwrap(await sb.from("sensor_test_internal_traces").insert(input).select("*").single());
}
