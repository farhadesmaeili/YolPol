FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install --yes --no-install-recommends acl python3 sudo util-linux \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 1001 yolpol-operator \
  && useradd --uid 1001 --gid 1001 --no-create-home --shell /bin/sh yolpol-operator \
  && groupadd --system --gid 1002 yolpol-deployment-agent \
  && useradd --system --uid 1002 --gid 1002 --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin yolpol-deployment-agent

COPY yolpol-deploy /opt/yolpol/bin/yolpol-deploy
COPY yolpol-deploy-internal /opt/yolpol/bin/yolpol-deploy-internal
COPY yolpol-deploy-policy.py /opt/yolpol/bin/yolpol-deploy-policy
COPY yolpol-bootstrap.py /opt/yolpol/bin/yolpol-bootstrap
COPY fake-public-smoke-curl.sh /usr/bin/curl
COPY sudoers.yolpol-deploy /etc/sudoers.d/yolpol-deploy
COPY sudoers.yolpol-deploy /usr/local/share/yolpol-deploy.sudoers
COPY sudoers.yolpol-deployment-agent /etc/sudoers.d/yolpol-deployment-agent
COPY sudoers.yolpol-deployment-agent /usr/local/share/yolpol-deployment-agent.sudoers
COPY test-wrapper-linux.sh /usr/local/bin/test-wrapper-linux
COPY test-bootstrap-linux.py /usr/local/bin/test-bootstrap-linux.py

RUN chown root:root /opt/yolpol/bin/yolpol-deploy /opt/yolpol/bin/yolpol-deploy-internal \
    /opt/yolpol/bin/yolpol-deploy-policy /usr/bin/curl \
    /opt/yolpol/bin/yolpol-bootstrap /etc/sudoers.d/yolpol-deploy /etc/sudoers.d/yolpol-deployment-agent \
    /usr/local/share/yolpol-deploy.sudoers /usr/local/share/yolpol-deployment-agent.sudoers \
    /usr/local/bin/test-wrapper-linux /usr/local/bin/test-bootstrap-linux.py \
  && chmod 0755 /opt/yolpol/bin/yolpol-deploy /usr/local/bin/test-wrapper-linux \
  && chmod 0500 /opt/yolpol/bin/yolpol-deploy-internal \
  && chmod 0555 /opt/yolpol/bin/yolpol-deploy-policy /opt/yolpol/bin/yolpol-bootstrap /usr/bin/curl \
    /usr/local/bin/test-bootstrap-linux.py \
  && chmod 0440 /etc/sudoers.d/yolpol-deploy /etc/sudoers.d/yolpol-deployment-agent

ENTRYPOINT ["/usr/local/bin/test-wrapper-linux"]
