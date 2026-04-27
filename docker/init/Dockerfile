FROM mongo:7.0-jammy
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY shared/scripts/create-travel-lab-indexes.js /workspace/shared/scripts/create-travel-lab-indexes.js
COPY docker/init/startup-init.sh /workspace/startup-init.sh
RUN chmod +x /workspace/startup-init.sh
CMD ["/workspace/startup-init.sh"]
