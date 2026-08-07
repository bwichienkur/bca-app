import { NextRequest, NextResponse } from "next/server";
import {
  operatorErrorResponse,
  requireOperatorApi,
} from "@/lib/lms-operator-api";
import {
  operatorGetDivisionSettings,
  loginLeagueOperator,
} from "@/lib/lms-operator";
import {
  operatorGetFormatTemplates,
  operatorSaveDivisionSettings,
  withOperatorSession,
} from "@/lib/lms-operator-manage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireOperatorApi();
    const divisionId = request.nextUrl.searchParams.get("divisionId")?.trim();
    const templatesOnly =
      request.nextUrl.searchParams.get("templates") === "1";

    if (templatesOnly) {
      const templates = await withOperatorSession((session) =>
        operatorGetFormatTemplates(session),
      );
      return NextResponse.json({ templates });
    }

    if (!divisionId) {
      return NextResponse.json(
        { error: "divisionId is required." },
        { status: 400 },
      );
    }

    const session = await loginLeagueOperator();
    const [settings, templates] = await Promise.all([
      operatorGetDivisionSettings(session, divisionId, false),
      operatorGetFormatTemplates(session),
    ]);
    return NextResponse.json({ settings, templates });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireOperatorApi();
    const body = (await request.json()) as {
      settings?: Record<string, unknown>;
    };
    if (!body.settings || typeof body.settings !== "object") {
      return NextResponse.json(
        { error: "settings object is required." },
        { status: 400 },
      );
    }
    const result = await withOperatorSession((session) =>
      operatorSaveDivisionSettings(session, body.settings!),
    );
    if (!result.success) {
      return NextResponse.json(
        {
          ok: false,
          error: result.messages.join("\n") || "Save failed.",
          messages: result.messages,
        },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      messages: result.messages,
      redirectUrl: result.redirectUrl,
    });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
