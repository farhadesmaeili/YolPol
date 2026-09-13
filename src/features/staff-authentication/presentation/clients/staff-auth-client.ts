type StaffAuthFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function submitStaffLogin(
  fetcher: StaffAuthFetch,
  input: Readonly<{email: string; password: string}>,
): Promise<"authenticated" | "failed"> {
  try {
    const response = await fetcher("/api/staff/auth/login", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(input),
    });
    return response.ok ? "authenticated" : "failed";
  } catch {
    return "failed";
  }
}

export async function submitStaffLogout(fetcher: StaffAuthFetch): Promise<"logged_out" | "failed"> {
  try {
    const response = await fetcher("/api/staff/auth/logout", {method: "POST"});
    return response.ok ? "logged_out" : "failed";
  } catch {
    return "failed";
  }
}
