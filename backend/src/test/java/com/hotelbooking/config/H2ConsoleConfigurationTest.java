package com.hotelbooking.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertiesPropertySource;
import org.springframework.core.env.PropertySourcesPropertyResolver;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the Phase 4 hardening of the H2 console: the console is a development
 * convenience and must resolve OFF everywhere except an explicit local
 * opt-in, no matter which configuration stack is in play.
 *
 * Two layers, each catching a different regression:
 *
 * 1. Resolution tests build the same property-source stack Spring Boot
 *    builds for a scenario - OS environment above profile-specific files
 *    above the plain file, lowest precedence added first - and resolve
 *    {@code spring.h2.console.enabled} through it. This covers the stacks a
 *    plain test cannot boot: the pure main-tree dev runtime (no test tree
 *    shadowing it) and the MySQL profile (which cannot boot without a real
 *    database). Files from the main tree are read module-relative
 *    ({@code src/main/resources/...}, with a repo-root fallback) - Surefire
 *    and IDE runs both start in the module directory, so no absolute or
 *    machine-specific path is involved.
 * 2. One live-context test boots the real application (test classpath,
 *    default h2 profile) and reads the property from the actual Environment,
 *    proving the test-tree shadowing resolves exactly as documented in the
 *    test resources.
 *
 * Scenario-to-requirement map: default dev off, the opt-in switch works,
 * MySQL stays off, and the test trees stay off - including the CI mysql leg.
 */
@SpringBootTest
class H2ConsoleConfigurationTest {

    private static final String KEY = "spring.h2.console.enabled";

    @Autowired
    private Environment liveEnvironment;

    // --- resolution helpers -------------------------------------------------

    /** Main-tree files sit beside the production code, outside the test classpath. */
    private Resource mainTree(String moduleRelativePath) {
        Path direct = Path.of(moduleRelativePath);
        if (Files.exists(direct)) {
            return new FileSystemResource(direct);
        }
        Path fromRepoRoot = Path.of("backend", moduleRelativePath);
        if (Files.exists(fromRepoRoot)) {
            return new FileSystemResource(fromRepoRoot);
        }
        throw new IllegalStateException(
                "Cannot locate main-tree resource " + moduleRelativePath
                        + " - run the suite with the backend module as the working directory");
    }

    /**
     * Resolves the console switch over the given files. The list is passed
     * lowest precedence first; property resolvers take the FIRST matching
     * source, so each successive (higher-precedence) file is pushed to the
     * front, ending with Boot's real stack order: profile file above the
     * plain file. With {@code simulatedEnvTrue}, an OS-environment-like
     * source sits ABOVE all files, mirroring Boot's real ordering for the
     * opt-in scenario. The YAML is loaded through
     * {@link YamlPropertiesFactoryBean} so values arrive as plain strings -
     * Boot's own origin-tracking loader wraps values in
     * {@code OriginTrackedValue}, which Boot's config-data pipeline unwraps
     * itself but a bare resolver would not, so placeholders like
     * {@code ${H2_CONSOLE_ENABLED:false}} would stay unresolved and the
     * simulation would lie about the runtime behaviour.
     */
    private String resolve(boolean simulatedEnvTrue, List<Resource> filesLowestPrecedenceFirst)
            throws IOException {
        MutablePropertySources sources = new MutablePropertySources();
        for (Resource file : filesLowestPrecedenceFirst) {
            YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
            yaml.setResources(file);
            yaml.afterPropertiesSet();
            Properties properties = yaml.getObject();
            if (properties != null && !properties.isEmpty()) {
                sources.addFirst(new PropertiesPropertySource(
                        file.getFilename(), properties));
            }
        }
        if (simulatedEnvTrue) {
            sources.addFirst(new MapPropertySource(
                    "simulated-os-environment", Map.of("H2_CONSOLE_ENABLED", "true")));
        }
        return new PropertySourcesPropertyResolver(sources).getProperty(KEY);
    }

    // --- the scenario guarantees --------------------------------------------

    @Test
    void theDefaultDevProfileResolvesTheConsoleOff() throws Exception {
        String resolved = resolve(false, List.of(
                mainTree("src/main/resources/application.yml"),
                mainTree("src/main/resources/application-h2.yml")));

        assertThat(resolved).as("the dev profile declares the switch explicitly").isNotNull();
        assertThat(Boolean.parseBoolean(resolved))
                .as("default dev runtime serves no /h2-console")
                .isFalse();
    }

    @Test
    void theDevOptInVariableTurnsTheConsoleOn() throws Exception {
        String resolved = resolve(true, List.of(
                mainTree("src/main/resources/application.yml"),
                mainTree("src/main/resources/application-h2.yml")));

        assertThat(Boolean.parseBoolean(resolved))
                .as("H2_CONSOLE_ENABLED=true is the explicit local opt-in")
                .isTrue();
    }

    @Test
    void theMysqlProfileResolvesTheConsoleOff() throws Exception {
        String resolved = resolve(false, List.of(
                mainTree("src/main/resources/application.yml"),
                mainTree("src/main/resources/application-mysql.yml")));

        assertThat(resolved).as("the MySQL profile pins the switch itself").isNotNull();
        assertThat(Boolean.parseBoolean(resolved))
                .as("switching to MySQL never drags the dev console along")
                .isFalse();
    }

    @Test
    void theTestTreeShadowsTheDevProfileOff() throws Exception {
        // The suite's h2 leg: the test-tree plain file and the test-tree
        // profile file (which shadows the main one) both live on the test
        // classpath, so they load by classpath location.
        String resolved = resolve(false, List.of(
                new ClassPathResource("application.yml"),
                new ClassPathResource("application-h2.yml")));

        assertThat(resolved).as("the test tree declares the switch explicitly").isNotNull();
        assertThat(Boolean.parseBoolean(resolved))
                .as("the suite never serves /h2-console")
                .isFalse();
    }

    @Test
    void theCiMysqlLegResolvesTheConsoleOff() throws Exception {
        // CI runs SPRING_PROFILES_ACTIVE=mysql on the test classpath: the
        // test-tree plain file plus the main-tree MySQL profile file (no
        // test-tree counterpart shadows it).
        String resolved = resolve(false, List.of(
                new ClassPathResource("application.yml"),
                mainTree("src/main/resources/application-mysql.yml")));

        assertThat(Boolean.parseBoolean(resolved))
                .as("the CI leg never serves /h2-console")
                .isFalse();
    }

    @Test
    void theLiveApplicationContextBootsWithTheConsoleDisabled() {
        // The real runtime resolution: proves the shadowing story the test
        // resources document, not just the file contents.
        String resolved = liveEnvironment.getProperty(KEY);

        assertThat(resolved).isNotNull();
        assertThat(Boolean.parseBoolean(resolved))
                .as("the booted application does not serve /h2-console")
                .isFalse();
    }
}
