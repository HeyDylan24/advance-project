import { useCallback, useEffect, useState } from "react";
import {
  ClerkProvider,
  SignIn,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/react";
import { analystAnalysisTabs, clientAnalysisTabs } from "./analysisTabs.js";
import "./portal.css";

const MAX_FILE_BYTES = 500 * 1024 * 1024;
const MAX_FILES = 10;

function SetupNotice({ title, children }) {
  return (
    <main className="portal-message">
      <span className="portal-mark">O</span>
      <p className="portal-kicker">OLIST / ANALYTICS WORKSPACE</p>
      <h1>{title}</h1>
      <p>{children}</p>
    </main>
  );
}

function SignInGate() {
  return (
    <main className="portal-signin">
      <div>
        <p className="portal-kicker">OLIST / ANALYTICS WORKSPACE</p>
        <h1>Sign in to your workspace</h1>
        <p>Clients can submit analysis requests. Analysts can review and accept work.</p>
      </div>
      <SignIn />
    </main>
  );
}

function RequestForm({ apiRequest, onCreated }) {
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (files.length > MAX_FILES) {
      setError(`Attach no more than ${MAX_FILES} files.`);
      return;
    }
    const oversized = files.find((file) => file.size > MAX_FILE_BYTES);
    if (oversized) {
      setError(`${oversized.name} exceeds the 500 MB per-file limit.`);
      return;
    }
    if (files.some((file) => file.size === 0)) {
      setError("Empty files cannot be attached.");
      return;
    }
    if (files.some((file) => !/\.(csv|zip)$/i.test(file.name))) {
      setError("Only CSV and ZIP files can be attached.");
      return;
    }

    setSubmitting(true);
    let created;
    try {
      created = await apiRequest("/api/analysis-requests", {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          question: form.get("question"),
          dataset_name: form.get("dataset_name") || "Client upload",
        }),
      });

      for (const file of files) {
        const upload = await apiRequest(
          `/api/analysis-requests/${created.request_id}/uploads`,
          {
            method: "POST",
            body: JSON.stringify({ filename: file.name, size_bytes: file.size }),
          },
        );
        for (let chunkIndex = 0; chunkIndex < upload.chunk_count; chunkIndex += 1) {
          const start = chunkIndex * upload.chunk_size;
          const end = Math.min(file.size, start + upload.chunk_size);
          setUploadProgress(`Uploading ${file.name} · ${chunkIndex + 1}/${upload.chunk_count}`);
          await apiRequest(
            `/api/analysis-requests/${created.request_id}/uploads/${upload.file_id}/chunks/${chunkIndex}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/octet-stream" },
              body: file.slice(start, end),
            },
          );
        }
        await apiRequest(
          `/api/analysis-requests/${created.request_id}/uploads/complete`,
          {
            method: "POST",
            body: JSON.stringify({ file_id: upload.file_id }),
          },
        );
      }

      formElement.reset();
      setFiles([]);
      setUploadProgress("");
      onCreated(created.request_id);
    } catch (requestError) {
      const ticketNote = created
        ? ` Request ${created.request_id} was created, but one or more files did not finish uploading. Please contact the analyst or submit a follow-up request.`
        : "";
      setError(`${requestError.message}${ticketNote}`);
    } finally {
      setSubmitting(false);
      setUploadProgress("");
    }
  }

  return (
    <section className="portal-card request-compose">
      <div className="portal-card-heading">
        <div>
          <p className="portal-kicker">NEW ANALYSIS REQUEST</p>
          <h2>What would you like to learn?</h2>
        </div>
        <span className="portal-tag">CSV / ZIP · 500 MB EACH</span>
      </div>
      <form className="request-form" onSubmit={submit}>
        <label>
          <span>Request title</span>
          <input name="title" required minLength={3} maxLength={160} placeholder="e.g. Understand repeat purchases" />
        </label>
        <label>
          <span>Dataset or business context</span>
          <input name="dataset_name" maxLength={160} placeholder="e.g. Q4 sales export, or an existing Neon dataset" />
        </label>
        <label>
          <span>Your analysis question</span>
          <textarea name="question" required minLength={5} maxLength={5000} rows={5} placeholder="Describe the question, useful measures, and any date range." />
        </label>
        <label className="upload-drop">
          <span>Attach data files <small>CSV or ZIP · up to 10 files</small></span>
          <input
            type="file"
            accept=".csv,.zip,text/csv,application/zip"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files || []))}
          />
          {files.length > 0 && (
            <span className="upload-file-list">
              {files.map((file) => `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`).join(" | ")}
            </span>
          )}
        </label>
        {error && <p className="portal-error" role="alert">{error}</p>}
        <button className="portal-button" type="submit" disabled={submitting}>
          {submitting ? uploadProgress || "Sending request…" : "Submit analysis request"}
        </button>
      </form>
      <p className="portal-footnote">Files are stored privately and shared only with authorized analysts. They are not processed automatically in this app.</p>
    </section>
  );
}

function RequestList({ requests, role, apiRequest, onChanged, loading }) {
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function decide(requestId, decision) {
    setActionError("");
    setBusyId(requestId);
    try {
      await apiRequest(`/api/analysis-requests/${requestId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      await onChanged();
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusyId("");
    }
  }

  async function download(requestId, fileId) {
    setActionError("");
    try {
      const file = await apiRequest(
        `/api/analysis-requests/${requestId}/uploads/${fileId}/download`,
      );
      const downloadUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = requests
        .flatMap((item) => item.files)
        .find((item) => item.file_id === fileId)?.filename || "analysis-data";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (requestError) {
      setActionError(requestError.message);
    }
  }

  return (
    <div className="request-list">
      <div className="request-list-tools">
        <button type="button" className="portal-button portal-button-secondary" disabled={loading} onClick={onChanged}>
          {loading ? "Refreshing…" : "Refresh requests"}
        </button>
      </div>
      {actionError && <p className="portal-error" role="alert">{actionError}</p>}
      {loading && !requests.length && <p className="portal-empty">Loading requests…</p>}
      {!loading && !requests.length && (
        <div className="portal-empty">
          <strong>{role === "analyst" ? "No requests yet" : "No requests submitted yet"}</strong>
          <span>{role === "analyst" ? "New client requests will appear here." : "Your submitted requests will appear here."}</span>
        </div>
      )}
      {requests.map((item) => (
        <article className="request-card" key={item.request_id}>
          <div className="request-card-top">
            <div>
              <span className={`request-status request-status-${item.status}`}>{item.status}</span>
              <h3>{item.title}</h3>
            </div>
            <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
          </div>
          <p className="request-context"><strong>Dataset:</strong> {item.dataset_name}</p>
          {role === "analyst" && <p className="request-context"><strong>Client account:</strong> {item.client_user_id}</p>}
          <p className="request-question">{item.question}</p>
          {item.files.length > 0 && (
            <div className="request-attachments">
              <strong>ATTACHMENTS</strong>
              {item.files.map((file) => (
                <button
                  type="button"
                  className="attachment-link"
                  key={file.file_id}
                  disabled={file.status !== "uploaded"}
                  onClick={() => download(item.request_id, file.file_id)}
                >
                  {file.filename} · {file.status === "uploaded" ? `${(file.size_bytes / 1024 / 1024).toFixed(1)} MB` : "upload incomplete"}
                </button>
              ))}
            </div>
          )}
          {role === "analyst" && item.status === "pending" && (
            <div className="request-actions">
              <button type="button" className="portal-button" disabled={busyId === item.request_id} onClick={() => decide(item.request_id, "accepted")}>
                Accept request
              </button>
              <button type="button" className="portal-button portal-button-secondary" disabled={busyId === item.request_id} onClick={() => decide(item.request_id, "declined")}>
                Decline
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function Workspace() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const role = user?.publicMetadata?.role;
  const [activeTab, setActiveTab] = useState("");
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestError, setRequestError] = useState("");

  const apiRequest = useCallback(async (url, options = {}) => {
    const token = await getToken();
    if (!token) throw new Error("Your session expired. Sign in again.");
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    const isJson = response.headers.get("content-type")?.includes("application/json");
    if (!response.ok) {
      const result = isJson
        ? await response.json().catch(() => ({}))
        : { detail: await response.text() };
      throw new Error(result.detail || `Request failed (${response.status}).`);
    }
    return isJson ? response.json() : response.blob();
  }, [getToken]);

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    setRequestError("");
    try {
      const result = await apiRequest("/api/analysis-requests");
      setRequests(result.requests);
    } catch (loadError) {
      setRequestError(loadError.message);
    } finally {
      setLoadingRequests(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    if (isSignedIn && (role === "client" || role === "analyst")) {
      loadRequests();
      setActiveTab(role === "client" ? "new-request" : "requests");
    }
  }, [isSignedIn, loadRequests, role]);

  if (!isLoaded) return <SetupNotice title="Loading workspace">Checking your sign-in…</SetupNotice>;
  if (!isSignedIn) return <SignInGate />;
  if (role !== "client" && role !== "analyst") {
    return (
      <div className="portal-shell">
        <header className="portal-header"><span className="portal-mark">O</span><strong>Commerce workspace</strong><UserButton /></header>
        <SetupNotice title="Account role required">Ask the workspace administrator to set your Clerk public metadata role to <code>client</code> or <code>analyst</code>.</SetupNotice>
      </div>
    );
  }

  const analysisTabs = role === "analyst"
    ? analystAnalysisTabs
    : clientAnalysisTabs.filter((tab) => tab.clientUserId === user.id);
  const tabs = role === "client"
    ? [
      { id: "new-request", label: "New request" },
      { id: "my-requests", label: "My requests" },
      ...analysisTabs.map(({ id, label }) => ({ id, label })),
    ]
    : [
      { id: "requests", label: "Request inbox" },
      ...analysisTabs.map(({ id, label }) => ({ id, label })),
    ];
  const selectedAnalysis = analysisTabs.find((tab) => tab.id === activeTab);
  const SelectedAnalysis = selectedAnalysis?.Component;

  async function createdRequest() {
    await loadRequests();
    setActiveTab("my-requests");
  }

  if (selectedAnalysis?.fullPage) {
    const Analysis = selectedAnalysis.Component;
    return <Analysis onBackToPortal={() => setActiveTab(role === "analyst" ? "requests" : "my-requests")} />;
  }

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <a className="portal-brand" href="/" aria-label="Commerce workspace home">
          <span className="portal-mark">O</span>
          <span>commerce <i>/ workspace</i></span>
        </a>
        <div className="portal-account">
          <span><strong>{user.fullName || user.primaryEmailAddress?.emailAddress}</strong><small>{role === "analyst" ? "Business analyst" : "Business client"}</small></span>
          <UserButton />
        </div>
      </header>
      <main className="portal-main">
        <section className="portal-title">
          <div>
            <p className="portal-kicker">{role === "analyst" ? "ANALYST WORKSPACE" : "CLIENT WORKSPACE"}</p>
            <h1>{role === "analyst" ? "Analysis requests" : "Your business questions"}</h1>
            <p>{role === "analyst" ? "Review incoming work, then build accepted analyses in your IDE." : "Share a question and its data. An analyst can accept it and create a tailored analysis."}</p>
          </div>
          <span className="portal-secure-tag">PRIVATE WORKSPACE</span>
        </section>
        <nav className="portal-tabs" aria-label="Workspace sections">
          {tabs.map((tab) => (
            <button type="button" key={tab.id} className={activeTab === tab.id ? "portal-tab portal-tab-active" : "portal-tab"} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
              {tab.id === "requests" && requests.filter((item) => item.status === "pending").length > 0 && (
                <span className="portal-tab-count">{requests.filter((item) => item.status === "pending").length}</span>
              )}
            </button>
          ))}
        </nav>
        {requestError && <p className="portal-error" role="alert">{requestError}</p>}
        {role === "client" && activeTab === "new-request" && (
          <RequestForm apiRequest={apiRequest} onCreated={createdRequest} />
        )}
        {role === "client" && activeTab === "my-requests" && (
          <RequestList requests={requests} role={role} apiRequest={apiRequest} onChanged={loadRequests} loading={loadingRequests} />
        )}
        {role === "analyst" && activeTab === "requests" && (
          <>
            <p className="portal-work-note">Accepting a request is the only workflow action here. Analysis code and new dashboard tabs are built and deployed from the analyst IDE.</p>
            <RequestList requests={requests} role={role} apiRequest={apiRequest} onChanged={loadRequests} loading={loadingRequests} />
          </>
        )}
        {SelectedAnalysis && !selectedAnalysis.fullPage && <SelectedAnalysis />}
      </main>
    </div>
  );
}

export default function App() {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return (
      <SetupNotice title="Clerk is not configured">
        Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> for the frontend, then restart the app.
      </SetupNotice>
    );
  }
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <Workspace />
    </ClerkProvider>
  );
}
