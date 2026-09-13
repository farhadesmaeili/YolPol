FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install --yes --no-install-recommends acl sudo util-linux \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 1001 yolpol-operator \
  && useradd --uid 1001 --gid 1001 --no-create-home --shell /bin/sh yolpol-operator

COPY yolpol-deploy /opt/yolpol/bin/yolpol-deploy
COPY sudoers.yolpol-deploy /etc/sudoers.d/yolpol-deploy
COPY test-wrapper-linux.sh /usr/local/bin/test-wrapper-linux

RUN chown root:root /opt/yolpol/bin/yolpol-deploy /etc/sudoers.d/yolpol-deploy /usr/local/bin/test-wrapper-linux \
  && chmod 0755 /opt/yolpol/bin/yolpol-deploy /usr/local/bin/test-wrapper-linux \
  && chmod 0440 /etc/sudoers.d/yolpol-deploy

ENTRYPOINT ["/usr/local/bin/test-wrapper-linux"]
