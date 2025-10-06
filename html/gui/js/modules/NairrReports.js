/**
 * NAIRR Reports Module for XDMoD Portal
 * @author Alex Tovar
 * @date 2025-07-14
 * @updated 2025-09-29
 *
 * This module provides a user interface for browsing and downloading NAIRR custom reports
 * within the XDMoD Portal. Reports are dynamically fetched from the `/custom_reports/reports`
 * REST endpoint, and are organized by year and month for ease of navigation.
 *
 * Key Features:
 * - Tree-based directory navigation of reports by year and month.
 * - Dynamic fetching and display of available reports, including thumbnails and metadata.
 * - Direct report downloads, triggered via a hidden iframe for seamless user experience.
 * - URL hash management: The current state (year, month, and optional report ID) is always
 *   encoded in the URL hash, enabling:
 *     - Deep linking/bookmarking to specific views or downloads.
 *     - State restoration on reload or after SSO redirection.
 *     - Back/forward navigation support.
 * - User-friendly handling of empty or error states.
 * - Designed for integration with the Ext JS framework and XDMoD’s existing module system.
 *
 * Usage:
 * - Place this module in the XDMoD Portal.
 * - Navigating the tree or triggering downloads will update the URL hash accordingly.
 * - Direct links to a specific report or month/year view are supported and restored on load.
 */

function buildReportUrl(year, month) {
  return XDMoD.REST.prependPathBase(
    `/custom_reports/reports?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`,
  );
}

function triggerReportDownload(reportId, year, month) {
  const qs = [];
  if (year) qs.push(`year=${encodeURIComponent(year)}`);
  if (month) qs.push(`month=${encodeURIComponent(month)}`);
  const url = `${XDMoD.REST.prependPathBase("/custom_reports/report/")}${reportId}${qs.length ? "?" + qs.join("&") : ""}`;
  let iframe = document.getElementById("nairr_report_download_iframe");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.id = "nairr_report_download_iframe";
    document.body.appendChild(iframe);
  }
  iframe.src = url;
}

// Utility to get params from hash instead of query string
function getHashParams() {
  const hash = window.location.hash.split("?")[1] || "";
  const params = new URLSearchParams(hash);
  return {
    year: params.get("year"),
    month: params.get("month"),
    report_id: params.get("report_id"),
  };
}

// Utility to set params in hash, preserving tab info
function setHashParams(obj) {
  // Preserve tab info (e.g. #main_tab_panel:nairr_reports)
  const pre =
    window.location.hash.split("?")[0] || "#main_tab_panel:nairr_reports";
  const params = new URLSearchParams();
  if (obj.year) params.set("year", obj.year);
  if (obj.month) params.set("month", obj.month);
  if (obj.report_id) params.set("report_id", obj.report_id);
  window.location.hash = `${pre}?${params.toString()}`;
}

XDMoD.Module.NairrReports = function (config) {
  XDMoD.Module.NairrReports.superclass.constructor.call(this, config);
};

Ext.apply(XDMoD.Module.NairrReports, {
  // Accept config and update hash accordingly
  setConfig: function (config, name) {
    Ext.getCmp("main_tab_panel").setActiveTab("nairr_reports");
  },
});

Ext.extend(XDMoD.Module.NairrReports, XDMoD.PortalModule, {
  module_id: "nairr_reports",
  usesToolbar: false,
  lastViewState: null,
  isRestoringState: false,
  viewingState: null,

  reloadReports: function (year, month) {
    var store = Ext.StoreMgr.get("customReportStore");
    if (!store) return;
    var mainPanel = Ext.getCmp("nairr_reports_main_panel");
    if (mainPanel) {
      mainPanel.setTitle(`NAIRR Reports for ${month} ${year}`);
    }
    store.proxy.conn.url = buildReportUrl(year, month);
    store.load();
  },

  initComponent: function () {
    // -----------------------------
    // Default Params: now from hashE~Z!
    const now = new Date();
    let hashParams = getHashParams();
    const defaultYear = hashParams.year || now.getFullYear();
    const defaultMonth =
      hashParams.month || now.toLocaleString("default", { month: "long" });
    let pendingReportId = hashParams.report_id || null;

    const initialUrl = buildReportUrl(defaultYear, defaultMonth);

    if (!window._nairrReportsHashHandler) {
      window._nairrReportsHashHandler = true;
      window.addEventListener("hashchange", function () {
        let tabPanel = Ext.getCmp("main_tab_panel");
        let activeTab = tabPanel ? tabPanel.getActiveTab() : null;
        if (activeTab) {
          let params = getHashParams();
          XDMoD.Module.NairrReports.prototype.reloadReports(
            params.year,
            params.month,
          );
          if (params.report_id) {
            triggerReportDownload(params.report_id, params.year, params.month);
          }
        }
      });
    }

    // Use hash for constructing report links;
    const getCustomReportQueryString = () => {
      let hashParams = getHashParams();
      const year = hashParams.year || defaultYear;
      const month = hashParams.month || defaultMonth;
      const out = [];
      if (year) out.push(`year=${encodeURIComponent(year)}`);
      if (month) out.push(`month=${encodeURIComponent(month)}`);
      return out.length ? "?" + out.join("&") : "";
    };
    const expandAndSelect = (tree, year, month, clickNode) => {
      const yearNode = tree.getRootNode().findChild("text", String(year));
      if (!yearNode) return;
      yearNode.expand(false, false, function () {
        const monthNode = yearNode.findChild("text", String(month));
        if (!monthNode) return;
        tree.getSelectionModel().select(monthNode);
        monthNode.ensureVisible();
        if (clickNode) monthNode.fireEvent("click", monthNode);
      });
    };

    const reportStore = new Ext.data.JsonStore({
      autoDestroy: true,
      autoLoad: true,
      storeId: "customReportStore",
      root: "report_list",
      idProperty: "name",
      fields: ["name", "version", "title", "description", "timestamp"],
      proxy: new Ext.data.HttpProxy({ url: initialUrl, method: "GET" }),
    });
    const reportContainer = new Ext.Panel({
      id: "nairr_reports_container",
      layout: "auto",
      autoScroll: true,
      region: "center",
      items: [],
      emptyText: `
        <div class="no-reports-container">
          <div class="no-reports-icon">&#9888;</div>
          <div class="no-reports-title">No reports available.</div>
        </div>
      `,
      updateReports: function (records) {
        this.removeAll(true);
        this.body.update("");
        Ext.each(records, function (record) {
          const report = record.data;
          const panel = new Ext.Panel({
            title: report.title,
            cls: "custom-report-panel",
            html: `
              <div class="custom-report-thumb-wrap" id="${report.name}">
                <div class="custom-report-thumb">
                  <img src="${XDMoD.REST.prependPathBase("/custom_reports/thumbnail/")}${report.name}${getCustomReportQueryString()}"
                       title="${report.name}" />
                </div>
                <div class="custom-report-thumb-desc">
                  <h2 class="custom-report-thumb-title">${report.title}</h2>
                  <p>Version: ${report.version}</p>
                  <p>${report.description}</p>
                  <p>Created At ${report.timestamp}</p>
                  <div>
                    <p><a href="${XDMoD.REST.prependPathBase("/custom_reports/report/")}${report.name}${getCustomReportQueryString()}" name="${report.name}">Download</a></p>
                  </div>
                </div>
              </div>
            `,
            listeners: {
              afterrender: function (p) {
                p.body.mask("Loading...");
                const img = p.body.dom.querySelector("img");
                if (img) {
                  img.onload = function () {
                    p.body.unmask();
                  };
                  img.onerror = function () {
                    p.body.unmask();
                  };
                } else {
                  p.body.unmask();
                }
              },
            },
          });
          reportContainer.add(panel);
        });
        this.doLayout();
      },
    });

    // UI Components
    const mainArea = new Ext.Panel({
      id: "nairr_reports_main_panel",
      title: `NAIRR Reports for ${defaultMonth} ${defaultYear}`,
      region: "center",
      layout: "fit",
      items: [reportContainer],
    });

    reportContainer.on("afterrender", function () {
      reportStore.on("load", function (store, records, success) {
        reportContainer.body.unmask();
        let hashParams = getHashParams();
        if (!success) {
          console.error("Failed to load reports.");
          reportContainer.body.update(`
              <div class="no-reports-container">
                <div class="no-reports-icon">&#9888;</div>
                <div class="no-reports-title">Failed to load reports. Please try again.</div>
              </div>
            `);
          return;
        }

        if (!records || records.length === 0) {
          reportContainer.body.update(reportContainer.emptyText);
          return;
        }

        reportContainer.updateReports(records);

        if (pendingReportId) {
          const matching = records.find((r) => r.data.name === pendingReportId);
          if (matching) {
            triggerReportDownload(
              pendingReportId,
              hashParams.year || defaultYear,
              hashParams.month || defaultMonth,
            );

            pendingReportId = null;
          }
        }
      });
    });

    const leftPanel = new Ext.tree.TreePanel({
      region: "west",
      width: 200,
      collapsible: true,
      title: "Report Directory",
      rootVisible: false,
      loader: new Ext.tree.TreeLoader({
        dataUrl: XDMoD.REST.prependPathBase("/custom_reports/report-directory"),
        requestMethod: "GET",
      }),
      root: new Ext.tree.AsyncTreeNode({ text: "Reports", expanded: true }),
      listeners: {
        click: (node) => {
          if (!node.isLeaf()) return;
          let hashParams = getHashParams();
          const year = node.parentNode.text;
          const month = node.text;
          delete hashParams.report_id;
          hashParams.year = year;
          hashParams.month = month;
          setHashParams(hashParams);
          this.reloadReports(year, month);
        },
        render: (tree) => {
          tree.getLoader().on("load", function (loader, node) {
            if (node.isRoot) {
              let hashParams = getHashParams();
              expandAndSelect(
                tree,
                hashParams.year || defaultYear,
                hashParams.month || defaultMonth,
                true,
              );
            }
          });
        },
      },
    });

    // -----------------------------
    // Module Layout & Tab Behavior
    Ext.apply(this, {
      layout: "border",
      items: [leftPanel, mainArea],
      listeners: {
        deactivate: () => {
          let hashParams = getHashParams();
          if (hashParams.year && hashParams.month) this.viewingState = null;
          {
            this.lastViewState = {
              year: hashParams.year,
              month: hashParams.month,
            };
          }
          setHashParams(hashParams);
        },
        activate: () => {
          if (reportContainer)
            reportContainer.body.update("") &&
              reportContainer.body.mask("Loading...");
          let hashParams = getHashParams();
          this.viewingState = {
            year:
              hashParams.year ||
              (this.lastViewState && this.lastViewState.year) ||
              defaultYear,
            month:
              hashParams.month ||
              (this.lastViewState && this.lastViewState.month) ||
              defaultMonth,
            report_id: hashParams.report_id || null,
          };

          // Only set hash if missing or out of sync
          if (
            hashParams.year !== this.viewingState.year ||
            hashParams.month !== this.viewingState.month
          ) {
            setHashParams(this.viewingState);
          }
          expandAndSelect(leftPanel, hashParams.year, hashParams.month, false);
        },
      },
    });

    XDMoD.Module.NairrReports.superclass.initComponent.apply(this, arguments);
  },
});
