export function detectTechnologies(html, headers = {}) {
  const detected = [];
  const htmlLower = html.toLowerCase();

  // Helper to normalize and search headers
  const headersLower = {};
  for (const [k, v] of Object.entries(headers)) {
    headersLower[k.toLowerCase()] = String(v).toLowerCase();
  }

  const serverHeader = headersLower["server"] || "";
  const poweredByHeader = headersLower["x-powered-by"] || "";

  // Technology rules array
  const rules = [
    // --- Frontend Frameworks & JS Libraries ---
    {
      name: "React",
      type: "JavaScript Library",
      detect: () => {
        if (htmlLower.includes("react.development.js") || htmlLower.includes("react.production.min.js")) return 90;
        if (htmlLower.includes("_reactrootcontainer") || htmlLower.includes("data-reactroot") || htmlLower.includes("id=\"react-root\"")) return 80;
        if (htmlLower.includes("react-dom")) return 50;
        return 0;
      },
    },
    {
      name: "Next.js",
      type: "Frontend Framework",
      detect: () => {
        if (htmlLower.includes("_next/static") || htmlLower.includes("__next_data__") || htmlLower.includes("next-head-count")) return 95;
        if (headersLower["x-nextjs-cache"] || headersLower["x-powered-by"]?.includes("next.js")) return 95;
        return 0;
      },
    },
    {
      name: "Vue",
      type: "Frontend Framework",
      detect: () => {
        if (htmlLower.includes("vue.js") || htmlLower.includes("vue.min.js")) return 90;
        if (htmlLower.includes("v-cloak") || htmlLower.includes("data-v-")) return 75;
        return 0;
      },
    },
    {
      name: "Nuxt.js",
      type: "Frontend Framework",
      detect: () => {
        if (htmlLower.includes("__nuxt__") || htmlLower.includes("data-n-head")) return 95;
        return 0;
      },
    },
    {
      name: "Angular",
      type: "Frontend Framework",
      detect: () => {
        if (htmlLower.includes("ng-version=") || htmlLower.includes("ng-app=") || htmlLower.includes("ng-controller=")) return 90;
        return 0;
      },
    },
    {
      name: "Remix",
      type: "Frontend Framework",
      detect: () => {
        if (htmlLower.includes("window.__remixmanifest")) return 95;
        return 0;
      },
    },
    {
      name: "Astro",
      type: "Frontend Framework",
      detect: () => {
        if (htmlLower.includes("astro-") || htmlLower.includes("data-astro-cid")) return 90;
        return 0;
      },
    },
    {
      name: "Svelte",
      type: "Frontend Framework",
      detect: () => {
        if (htmlLower.includes("class=\"svelte-") || htmlLower.includes("svelte-announcer")) return 85;
        return 0;
      },
    },
    {
      name: "Shopify Hydrogen",
      type: "Frontend Framework",
      detect: () => {
        if (htmlLower.includes("hydrogen-") || headersLower["x-hydrogen-version"]) return 95;
        return 0;
      },
    },

    // --- Backend Frameworks & Runtimes ---
    {
      name: "Laravel",
      type: "Backend Framework",
      detect: () => {
        if (headersLower["set-cookie"]?.includes("laravel_session") || headersLower["set-cookie"]?.includes("xsrf-token")) return 85;
        if (htmlLower.includes("name=\"_token\" value=")) return 50;
        return 0;
      },
    },
    {
      name: "Django",
      type: "Backend Framework",
      detect: () => {
        if (headersLower["set-cookie"]?.includes("csrftoken")) return 80;
        if (htmlLower.includes("name=\"csrfmiddlewaretoken\"")) return 85;
        return 0;
      },
    },
    {
      name: "Flask",
      type: "Backend Framework",
      detect: () => {
        if (headersLower["set-cookie"]?.includes("session=") && headersLower["set-cookie"]?.includes(".sig=")) return 60;
        return 0;
      },
    },
    {
      name: "Express.js",
      type: "Backend Framework",
      detect: () => {
        if (poweredByHeader.includes("express")) return 90;
        return 0;
      },
    },
    {
      name: "Node.js",
      type: "Runtime Environment",
      detect: () => {
        if (poweredByHeader.includes("node") || poweredByHeader.includes("express")) return 80;
        return 0;
      },
    },
    {
      name: "ASP.NET",
      type: "Backend Framework",
      detect: () => {
        if (poweredByHeader.includes("asp.net") || headersLower["x-aspnet-version"]) return 95;
        if (htmlLower.includes("__viewstate") || htmlLower.includes("__eventvalidation")) return 90;
        return 0;
      },
    },
    {
      name: "Ruby on Rails",
      type: "Backend Framework",
      detect: () => {
        if (htmlLower.includes("name=\"csrf-param\" content=\"authenticity_token\"")) return 90;
        if (poweredByHeader.includes("phusion passenger") || headersLower["x-runtime"]) return 75;
        return 0;
      },
    },

    // --- Programming Languages ---
    {
      name: "PHP",
      type: "Programming Language",
      detect: () => {
        if (poweredByHeader.includes("php") || headersLower["set-cookie"]?.includes("phpsessid")) return 90;
        if (htmlLower.includes(".php?") || htmlLower.includes(".php\"")) return 60;
        return 0;
      },
    },
    {
      name: "Java",
      type: "Programming Language",
      detect: () => {
        if (headersLower["set-cookie"]?.includes("jsessionid")) return 90;
        return 0;
      },
    },

    // --- Styling Frameworks & Libraries ---
    {
      name: "Tailwind CSS",
      type: "CSS Framework",
      detect: () => {
        // Tailwind classes are specific; let's check for standard patterns in HTML classes
        const matches = htmlLower.match(/class=["'][^"']*(?:sm:|md:|lg:|xl:|2xl:|focus:|hover:)[^"']*["']/g);
        if (matches && matches.length > 5) return 80;
        if (htmlLower.includes("tailwindcss") || htmlLower.includes("tailwind.config")) return 75;
        return 0;
      },
    },
    {
      name: "Bootstrap",
      type: "CSS Framework",
      detect: () => {
        if (htmlLower.includes("bootstrap.css") || htmlLower.includes("bootstrap.min.css") || htmlLower.includes("bootstrap.js") || htmlLower.includes("bootstrap.min.js")) return 90;
        if (htmlLower.includes("class=\"row\"") && htmlLower.includes("class=\"col-md-") && htmlLower.includes("class=\"container\"")) return 70;
        return 0;
      },
    },
    {
      name: "Material UI",
      type: "UI Library",
      detect: () => {
        if (htmlLower.includes("class=\"mui") || htmlLower.includes("class=\"muibutton-") || htmlLower.includes("mui-paper-root")) return 85;
        return 0;
      },
    },
    {
      name: "Styled Components",
      type: "CSS-in-JS Library",
      detect: () => {
        if (htmlLower.includes("data-styled=") || htmlLower.includes("data-styled-components=")) return 90;
        return 0;
      },
    },
    {
      name: "Chakra UI",
      type: "UI Library",
      detect: () => {
        if (htmlLower.includes("chakra-ui") || htmlLower.includes("class=\"chakra-")) return 90;
        return 0;
      },
    },

    // --- Build Tools & Tooling ---
    {
      name: "Vite",
      type: "Build Tool",
      detect: () => {
        if (htmlLower.includes("/@vite/client") || htmlLower.includes("vite dev server")) return 95;
        return 0;
      },
    },
    {
      name: "Webpack",
      type: "Build Tool",
      detect: () => {
        if (htmlLower.includes("webpackjsonp") || htmlLower.includes("window.webpack")) return 85;
        return 0;
      },
    },

    // --- CDN, Hosting & Platforms ---
    {
      name: "Cloudflare",
      type: "CDN & Security",
      detect: () => {
        if (serverHeader.includes("cloudflare")) return 95;
        if (headersLower["cf-ray"] || headersLower["cf-cache-status"]) return 95;
        return 0;
      },
    },
    {
      name: "Vercel",
      type: "Hosting Platform",
      detect: () => {
        if (headersLower["x-vercel-id"] || headersLower["x-vercel-cache"] || serverHeader === "vercel") return 95;
        return 0;
      },
    },
    {
      name: "Netlify",
      type: "Hosting Platform",
      detect: () => {
        if (headersLower["x-nf-request-id"] || serverHeader === "netlify") return 95;
        return 0;
      },
    },
    {
      name: "Amazon Web Services (AWS)",
      type: "Cloud Platform",
      detect: () => {
        if (serverHeader.includes("amazons3") || headersLower["x-amz-cf-id"] || headersLower["x-amz-request-id"]) return 90;
        return 0;
      },
    },
    {
      name: "Firebase",
      type: "Backend-as-a-Service",
      detect: () => {
        if (htmlLower.includes("firebase-app.js") || htmlLower.includes("firebasejs")) return 90;
        return 0;
      },
    },
    {
      name: "Supabase",
      type: "Backend-as-a-Service",
      detect: () => {
        if (htmlLower.includes("supabase-js")) return 90;
        return 0;
      },
    },
  ];

  for (const rule of rules) {
    const score = rule.detect();
    if (score >= 15) {
      let confidence = "Low";
      if (score >= 75) {
        confidence = "High";
      } else if (score >= 40) {
        confidence = "Medium";
      }
      detected.push({
        name: rule.name,
        type: rule.type,
        confidence,
        percentage: score,
      });
    }
  }

  // Sort by percentage confidence descending
  detected.sort((a, b) => b.percentage - a.percentage);
  return detected;
}
