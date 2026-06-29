import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "../shared/const";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const rolelessUser: AuthenticatedUser = {
  id: 1,
  openId: "roleless-user",
  email: "operator-test@example.com",
  name: "Roleless User",
  loginMethod: "manus",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

describe("ops authorization boundary", () => {
  it("keeps system.health public", async () => {
    const caller = appRouter.createCaller(createContext(null));

    await expect(caller.system.health({ timestamp: 0 })).resolves.toEqual({
      ok: true,
    });
  });

  it("rejects unauthenticated ops reads before hitting a domain handler", async () => {
    const caller = appRouter.createCaller(createContext(null));

    await expect(caller.inventory.summary()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: UNAUTHED_ERR_MSG,
    });
    await expect(caller.system.supabaseDebug()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: UNAUTHED_ERR_MSG,
    });
  });

  it("rejects unauthenticated ops mutations before hitting a domain handler", async () => {
    const caller = appRouter.createCaller(createContext(null));

    await expect(caller.labels.markPrinted({ ids: ["copy-1"] })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: UNAUTHED_ERR_MSG,
    });
  });

  it("rejects authenticated non-operators from ops reads and mutations", async () => {
    const caller = appRouter.createCaller(createContext(rolelessUser));

    await expect(caller.members.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: NOT_ADMIN_ERR_MSG,
    });
    await expect(caller.donations.add({
      title: "Test Book",
      author: "Test Author",
      condition: "good",
    })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: NOT_ADMIN_ERR_MSG,
    });
  });
});